// Non-standard body plans built with the Kit: jellyfish, crabs (front-facing, side-walking), hermit crab,
// sea turtle (flapping flippers), stingrays (undulating wings). They produce SpeciesAssets like the lofted fish,
// so FishModel / buildFish treat them the same; limbs are per-instance child meshes sharing the instance
// material (one compiled program, flash + uniforms shared).
//
// Orientation: like fish, "forward" is +x. Exceptions documented per builder: the jellyfish is upright (bell
// apex +y, tentacles hanging -y) and crabs face the camera (+z) and walk along x.
import * as THREE from 'three';
import { Kit } from './kit';
import { Page, Rect, paintSwatch, paintEye, grad, dmix, C, mix, shade } from './page';
import { V3, add, sub, scale, norm, cross } from '../gfx/loft';
import { FishModel, SpeciesAsset, makeAsset } from './model';
import { SwimFlags } from './swim';
import type { UwOpts } from '../gfx/shaders/underwater';
import { hash2, vnoise, clamp } from '../core/math';
import { worley, RGB } from '../gfx/px';
import { smoothstep } from './curve';

const TAU = Math.PI * 2;
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

interface KitAssetOpts {
  length: number; mouth: V3; eye: V3; eyeR?: number;
  mode?: SwimFlags['mode']; vertical?: boolean;
  shape?: [number, number, number, number]; shape2?: [number, number, number, number]; jaw?: [number, number, number, number];
  amp?: number; freq?: number; freqK?: number;
  uwo?: UwOpts; emissive?: number; clearcoat?: number; clearcoatRough?: number; normal?: number;
  parts?: SpeciesAsset['parts']; animate?: SpeciesAsset['animate'];
  anchors?: Record<string, V3>;
  side?: THREE.Side;
}
function kitAsset(name: string, geo: THREE.BufferGeometry, pg: Page, o: KitAssetOpts): SpeciesAsset {
  const tex = pg.textures(o.normal ?? 2);
  const anchors: Record<string, THREE.Vector3> = {};
  for (const k in o.anchors ?? {}) anchors[k] = v3(o.anchors![k]);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius *= 1.3;
  return makeAsset({
    name, geo, map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap,
    emissive: o.emissive ?? 1.5,
    uni: {
      uShape: { value: new THREE.Vector4(...(o.shape ?? [o.length / 2, o.length, 0, 0])) },
      uShape2: { value: new THREE.Vector4(...(o.shape2 ?? [2, 4, 0.01, 0])) },
      uJawP: { value: new THREE.Vector4(...(o.jaw ?? [0, 0, 0, 0])) },
    },
    flags: { mode: o.mode ?? 0, vertical: o.vertical }, uwo: o.uwo ?? { rim: 0.4, sss: [0.9, 0.85, 0.8], sssK: 0.7 },
    length: o.length, mouth: v3(o.mouth), eye: v3(o.eye), eyeR: o.eyeR ?? 0.02, anchors,
    amp: o.amp ?? 0, freq: o.freq ?? 1, freqK: o.freqK ?? 0, jawIdle: 0, normalScale: 0.6,
    parts: o.parts, animate: o.animate, side: o.side,
    clearcoat: o.clearcoat ?? 0.5, clearcoatRough: o.clearcoatRough ?? 0.3,
  });
}

/** paint a rect pixel by pixel: fn(u, v, i, j) -> [colour, alpha 0..1, rough, height] */
function paintRect(pg: Page, r: Rect, fn: (u: number, v: number, i: number, j: number) => [RGB, number, number, number], glow?: (u: number, v: number, i: number, j: number) => RGB | null) {
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const u = i / (r.w - 1), v = j / (r.h - 1);
    const [c, a, ro, h] = fn(u, v, i, j);
    pg.set(r.x + i, r.y + j, c, Math.round(clamp(a, 0, 1) * 255), ro, h);
    if (glow) { const g = glow(u, v, i, j); if (g) pg.setGlow(r.x + i, r.y + j, g); }
  }
}

// ============================================================================================ jellyfish
// Mauve stinger (Pelagia): a translucent pink dome speckled with stinging warts, scalloped margin, eight long
// marginal tentacles and four frilly oral arms. Upright: bell apex +y. Glows softly.
function jellyfish(): SpeciesAsset {
  const pg = new Page(256, 256), K = new Kit(pg);
  const R = 0.24, H = 0.2;
  const bellR = pg.alloc(128, 64), innerR = pg.alloc(64, 32), tentR = pg.alloc(8, 64), armR = pg.alloc(48, 96);
  const warts = (u: number, v: number) => { const [f1, , id] = worley(u * 128, v * 64 * (0.4 + v), 6, 11); return f1 < 1.5 - v * 0.5 && id < 0.55 && v > 0.1; };
  paintRect(pg, bellR, (u, v, i, j) => {
    let c = grad(['#ffd0ec', '#f4a0d4', '#e070b8', '#c04c9c', '#8a2a78'])(v * 0.9 + 0.05, i, j);
    let a = 0.52 + v * 0.1, h = 0;
    // 16 radial canals
    if (Math.abs(((u * 16) % 1) - 0.5) < 0.05 && v > 0.15) { c = shade(c, 1.15); a += 0.15; }
    if (warts(u, v)) { c = C('#a8286e'); a = 0.95; h = 1; }
    // scalloped margin band
    if (v > 0.88) { c = C('#7a1a60'); a = 0.85; }
    return [c, a, 0.15, h];
  }, (u, v) => (warts(u, v) ? [120, 30, 90] : v > 0.86 ? [90, 20, 80] : null));
  paintRect(pg, innerR, (u, v, i, j) => [grad(['#f8b8e0', '#d070b0', '#9a3a88'])(v, i, j), 0.42, 0.2, 0]);
  paintRect(pg, tentR, (u, v, i, j) => [mix(C('#f0a0d8'), C('#b03a90'), v), 0.75 - v * 0.25, 0.3, 0], (u, v, i, j) => ((j % 6) === 0 ? [140, 40, 110] : null));
  paintRect(pg, armR, (u, v, i, j) => {
    // frilled ribbon: wavy edges cut out with alpha, darker folds
    const edge = 0.5 - Math.abs(u - 0.5);
    const frill = 0.08 + 0.06 * Math.sin(v * 70) + 0.03 * Math.sin(v * 23);
    if (edge < frill * (0.6 + v * 0.6) - 0.06) return [[0, 0, 0], 0, 0.3, 0];
    const fold = Math.sin(v * 70 + u * 3);
    const c = shade(grad(['#ffb0e0', '#e070c0', '#b03a98', '#7a2070'])(v, i, j), 0.9 + fold * 0.12);
    return [c, 0.7, 0.25, fold * 0.3];
  }, (u, v) => (Math.sin(v * 70) > 0.8 ? [80, 20, 70] : null));

  // bell: outer dome (apex -> margin) and inner subumbrella
  const NS = 32, NR = 14;
  const bellPt = (th: number, v: number, k: number): V3 => {
    const r = R * k * Math.pow(Math.sin((v * Math.PI) / 2), 0.75) * (1 + (v > 0.85 ? 0.045 * Math.abs(Math.sin(th * 8)) * (v - 0.85) / 0.15 : 0));
    const y = H * k * Math.pow(Math.cos((v * Math.PI) / 2), 1.15) - (k < 1 ? 0.012 : 0);
    return [Math.cos(th) * r, y, Math.sin(th) * r];
  };
  for (const [k, rect, flip] of [[1, bellR, false], [0.9, innerR, true]] as [number, Rect, boolean][]) {
    const rings: { pts: V3[]; v: number }[] = [];
    for (let i = 1; i <= NR; i++) { const v = i / NR, pts: V3[] = []; for (let j = 0; j <= NS; j++) pts.push(bellPt((TAU * j) / NS, v, k)); rings.push({ pts, v }); }
    K.loftPart(rings, rect, { start: [0, H * k - (k < 1 ? 0.012 : 0), 0], flip }, (i, A, p) => { A.swim[i * 4] = Math.min(1, Math.hypot(p[0], p[2]) / R); A.ao[i] = flip ? 0.7 : 1; });
  }
  // marginal tentacles
  for (let n = 0; n < 8; n++) {
    const th = ((n + 0.5) / 8) * TAU, L = 0.9 + hash2(n, 2, 3) * 0.5;
    const path: V3[] = [];
    for (let i = 0; i <= 22; i++) { const f = i / 22; path.push([Math.cos(th) * R * (0.98 - f * 0.25), -f * L, Math.sin(th) * R * (0.98 - f * 0.25)]); }
    const from = K.lo.count;
    K.lo.tube(path, (t) => 0.0055 * (1 - t * 0.6), 4, pg.reg(tentR), K.newG(), { capEnd: true });
    K.tag(from, (i, A) => { const p = K.lo.pos(i); const f = Math.min(1, -p[1] / L); A.swim[i * 4] = 1; A.swim[i * 4 + 1] = n * 1.7; A.swim[i * 4 + 2] = f; A.ao[i] = 1; });
  }
  // oral arms: twisting frilly ribbons
  for (let n = 0; n < 4; n++) {
    const th0 = (n / 4) * TAU, L = 0.55;
    const grid: V3[][] = [];
    for (let i = 0; i <= 18; i++) {
      const f = i / 18, th = th0 + f * 2.2, w = 0.05 * (1 - f * 0.55), rr = 0.03 + f * 0.04;
      const c: V3 = [Math.cos(th0) * rr, -0.01 - f * L, Math.sin(th0) * rr];
      const d: V3 = [Math.cos(th) * w, 0, Math.sin(th) * w];
      grid.push([sub(c, d), c, add(c, d)]);
    }
    K.sheetPart(grid, armR, 0, (i, A, u, v) => { A.swim[i * 4] = 1; A.swim[i * 4 + 1] = n * 2.3 + 0.5; A.swim[i * 4 + 2] = v * 0.8; A.ao[i] = 0.9; });
  }
  const { geo } = K.geometry();
  return kitAsset('jellyfish', geo, pg, {
    length: R * 2, mouth: [0, -0.02, 0], eye: [0, H * 0.5, R * 0.6], mode: 1,
    shape: [0, 1, 0, 0], shape2: [1, 2, 0.01, 0], amp: 0, freq: 0.85, freqK: 0.2,
    emissive: 1.2, uwo: { rim: 0.6, rimCol: [1, 0.7, 0.9], sss: [1, 0.6, 0.85], sssK: 0.9, caustics: 0.6 }, clearcoat: 0.8, clearcoatRough: 0.15,
    side: THREE.DoubleSide,
  });
}

// ============================================================================================ crab
// Red rock crab, facing the camera (+z), walking sideways along x. Carapace with voxel tubercles, stalked eyes,
// two black-tipped claws and eight jointed legs (child meshes animated per instance).
interface LimbGeo { geo: THREE.BufferGeometry; len: number }
function segGeo(pg: Page, rect: Rect, len: number, r0: number, r1: number, flat = 0.7, tip = false, bulge = 0): LimbGeo {
  const K = new Kit(pg);
  const rings: { pts: V3[]; v: number }[] = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const f = i / N;
    const r = (r0 + (r1 - r0) * f) * (1 + bulge * Math.sin(f * Math.PI)) * (tip && f > 0.6 ? 1 - (f - 0.6) / 0.4 * 0.92 : 1);
    rings.push({ pts: Kit.ring([f * len, 0, 0], [0, 0, 1], [0, 1, 0], r * flat, r, 10), v: f });
  }
  K.loftPart(rings, rect, { start: [-r0 * 0.4, 0, 0], end: [len + (tip ? 0.004 : r1 * 0.4), 0, 0] });
  return { geo: K.geometry().geo, len };
}

function crabBase(name: string, pal: { shell: string[]; leg: string[]; tip: string; spots: string; eye: string }, hermit = false): SpeciesAsset {
  const pg = new Page(256, 256), K = new Kit(pg);
  const shellR = pg.alloc(128, 64), legR = pg.alloc(32, 32), tipR = pg.alloc(16, 32), clawR = pg.alloc(48, 48), knobR = pg.alloc(8, 8), eyeR = pg.alloc(16, 16), stalkR = pg.alloc(8, 16);
  const shellG = grad(pal.shell);
  paintRect(pg, shellR, (u, v, i, j) => {
    // rings run along x (v = left -> right), u around the ring (0 = top)
    const top = Math.cos(u * TAU);
    let c = shellG(0.12 + (1 - top) * 0.42 + Math.abs(v - 0.5) * 0.25, i, j);
    let h = 0;
    // granular tubercles: small pale dots on a staggered grid
    const gx = i + ((j >> 2) & 1) * 2, cell = (gx % 4) + (j % 4) * 4;
    if (top > -0.1 && cell === 5 && hash2(gx >> 2, j >> 2, 3) < 0.7) { c = mix(c, C(pal.spots), 0.75); h = 1; }
    else if (top > -0.1 && (cell === 6 || cell === 9)) { c = shade(c, 1.08); h = 0.5; }
    // grooves outlining the gastric / branchial regions
    const gz = Math.abs(Math.abs(v - 0.5) - 0.17);
    if (top > 0.35 && gz < 0.012) c = shade(c, 0.7);
    if (top < 0.1 && top > -0.25) c = shade(c, 0.85);
    return [c, 1, 0.36, h];
  });
  paintRect(pg, legR, (u, v, i, j) => [shade(grad(pal.leg)(v, i, j), 0.9 + 0.2 * Math.cos(u * TAU)), 1, 0.4, (i + j) % 5 === 0 ? 0.6 : 0]);
  paintRect(pg, tipR, (u, v, i, j) => [grad([pal.leg[pal.leg.length - 1], pal.tip, pal.tip])(v, i, j), 1, 0.3, 0]);
  paintRect(pg, clawR, (u, v, i, j) => {
    let c = shade(grad(pal.shell)(0.2 + v * 0.5, i, j), 0.85 + 0.25 * Math.cos(u * TAU));
    if (vnoise(i * 0.4, j * 0.4, 9) > 0.65) c = mix(c, C(pal.spots), 0.6);
    return [c, 1, 0.35, vnoise(i * 0.5, j * 0.5, 2) * 0.8];
  });
  paintSwatch(pg, knobR, [pal.shell[pal.shell.length - 1], pal.shell[2], pal.shell[1]], 0.35);
  paintEye(pg, eyeR, { iris: ['#050505', '#151515', '#303030', '#505050'], pupil: 0.3, sclera: pal.eye, irisR: 0.98 });
  paintSwatch(pg, stalkR, pal.leg, 0.4);

  const W = hermit ? 0.11 : 0.17, D = hermit ? 0.08 : 0.12, Ht = hermit ? 0.05 : 0.075;
  // carapace: rings along x (left -> right) in the yz plane
  const rings: { pts: V3[]; v: number }[] = [];
  const NX = 22;
  for (let i = 0; i <= NX; i++) {
    const f = i / NX, x = (f * 2 - 1) * W;
    const e = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / W, 2.4)));
    const dz = D * (0.25 + 0.75 * e), zc = D * 0.12 * e;
    const pts: V3[] = [];
    for (let k = 0; k <= 20; k++) {
      const th = (k / 20) * TAU, s = Math.sin(th), co = Math.cos(th);
      const y = co >= 0 ? Ht * Math.pow(co, 0.7) * (0.35 + 0.65 * e) : Ht * 0.35 * co * (0.4 + 0.6 * e);
      // serrated front margin
      const teeth = s > 0.3 && co > -0.3 && Math.abs(x) > W * 0.2 ? 0.04 * Math.max(0, Math.sin(x / W * 30)) : 0;
      pts.push([x, y, zc + s * dz * (1 + teeth)]);
    }
    rings.push({ pts, v: f });
  }
  K.loftPart(rings, shellR, { start: [-W - 0.004, 0, 0], end: [W + 0.004, 0, 0] });
  // voxel tubercles on the shell (rows of little cubes)
  const knobReg = pg.reg(knobR);
  for (let n = 0; n < 34; n++) {
    const x = (hash2(n, 1, 7) * 2 - 1) * W * 0.8, z = (hash2(n, 2, 7) * 2 - 1) * D * 0.6 + D * 0.1;
    const e = Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / W, 2.4)) * Math.max(0, 1 - Math.pow((z - D * 0.1) / D, 2)));
    const y = Ht * Math.pow(e, 0.7) * 0.98;
    const sz = 0.008 + hash2(n, 3, 7) * 0.008;
    const from = K.lo.count;
    const rot = new THREE.Matrix4().makeRotationY(hash2(n, 4, 7) * 1.5);
    K.lo.box([x, y, z], [sz, sz * 0.8, sz], knobReg, undefined, rot);
    K.tag(from, (i, A) => { A.ao[i] = 1; });
  }
  // eye stalks + eyes (front centre)
  for (const s of [-1, 1]) {
    const base: V3 = [s * W * 0.16, Ht * 0.45, D * 0.95];
    const top: V3 = [s * W * 0.22, Ht * 1.15, D * 1.05];
    K.tube([base, [s * W * 0.19, Ht * 0.8, D * 1.0], top], (t) => 0.007 - t * 0.002, 6, stalkR, { capEnd: false });
    const er = 0.011;
    const fe = K.lo.count;
    K.blob(top, [er, er * 1.15, er], eyeR, { seg: 12 });
    const ereg = pg.reg(eyeR);
    K.tag(fe, (i, A) => {
      const p = K.lo.pos(i), q = sub(p, top);
      K.lo.UV[i * 2] = ereg.x + clamp(0.5 + q[0] / (2 * er), 0, 1) * ereg.w;
      K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - q[1] / (2 * er * 1.15), 0, 1) * ereg.h);
      A.eye[i * 4] = top[0]; A.eye[i * 4 + 1] = top[1]; A.eye[i * 4 + 2] = top[2]; A.eye[i * 4 + 3] = 1;
    });
  }
  // mouthparts plate
  K.blob([0, -Ht * 0.05, D * 0.85], [W * 0.18, Ht * 0.3, 0.012], clawR, { seg: 10 });
  const body = K.geometry().geo;

  // limb geometries (shared per species)
  const legLen = hermit ? [0.07, 0.06, 0.045] : [0.11, 0.09, 0.07];
  const lr = hermit ? 0.008 : 0.012;
  const seg1 = segGeo(pg, legR, legLen[0], lr, lr * 0.85, 0.7, false, 0.1);
  const seg2 = segGeo(pg, legR, legLen[1], lr * 0.85, lr * 0.65, 0.7, false, 0.1);
  const seg3 = segGeo(pg, tipR, legLen[2], lr * 0.65, lr * 0.3, 0.7, true);
  const cs = hermit ? 0.75 : 1;
  const arm = segGeo(pg, clawR, 0.08 * cs, 0.016 * cs, 0.018 * cs, 0.75, false, 0.15);
  const palm = segGeo(pg, clawR, 0.085 * cs, 0.024 * cs, 0.03 * cs, 0.62, false, 0.3);
  const finger = segGeo(pg, tipR, 0.07 * cs, 0.014 * cs, 0.004, 0.6, true);

  const parts = (m: FishModel) => {
    const mat = m.material;
    const mk = (g: LimbGeo) => { const ms = new THREE.Mesh(g.geo, mat); ms.castShadow = true; ms.customDepthMaterial = m.asset.depthMat; return ms; };
    const legs: THREE.Object3D[][] = [];
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      if (hermit && k > 2) continue;
      const root = new THREE.Object3D();
      root.position.set(s * W * 0.85, -Ht * 0.1, D * (0.35 - k * 0.32));
      root.rotation.y = s > 0 ? -(k - 1.5) * 0.28 : Math.PI + (k - 1.5) * 0.28;
      const a = new THREE.Object3D(), b = new THREE.Object3D(), c = new THREE.Object3D();
      a.add(mk(seg1)); b.position.x = seg1.len; b.add(mk(seg2)); c.position.x = seg2.len; c.add(mk(seg3));
      a.add(b); b.add(c); root.add(a);
      a.rotation.z = 0.5; b.rotation.z = -1.0; c.rotation.z = -0.6;
      m.group.add(root);
      legs.push([root, a, b, c]);
    }
    const claws: THREE.Object3D[][] = [];
    for (const s of [-1, 1]) {
      const root = new THREE.Object3D();
      root.position.set(s * W * 0.55, 0, D * 0.75);
      root.rotation.y = s > 0 ? -0.9 : Math.PI + 0.9;
      const a = mk(arm); const pv = new THREE.Object3D(); pv.position.x = arm.len; const pm = mk(palm); pv.add(pm);
      const fix = new THREE.Object3D(); fix.position.set(palm.len, -0.006 * cs, 0); fix.add(mk(finger)); fix.rotation.z = -0.15;
      const mov = new THREE.Object3D(); mov.position.set(palm.len * 0.9, 0.012 * cs, 0); mov.add(mk(finger)); mov.rotation.z = 0.3;
      pv.add(fix, mov);
      const ar = new THREE.Object3D(); ar.add(a, pv); root.add(ar);
      ar.rotation.z = 0.35; pv.rotation.y = s > 0 ? 0.9 : 0.9; pv.rotation.z = 0.2;
      m.group.add(root);
      claws.push([root, ar, pv, mov]);
    }
    (m.parts as Record<string, unknown>).legs = legs as unknown as THREE.Object3D;
    m.anim.walk = 0; m.anim.pinch = 0; m.anim.raise = 0; m.anim.walkPhase = m.seed;
    (m as unknown as { crab: unknown }).crab = { legs, claws };
  };
  const animate = (m: FishModel, dt: number) => {
    const cr = (m as unknown as { crab: { legs: THREE.Object3D[][]; claws: THREE.Object3D[][] } }).crab;
    if (!cr) return;
    const w = m.anim.walk ?? 0;
    m.anim.walkPhase = (m.anim.walkPhase ?? 0) + dt * (2 + Math.abs(w) * 14);
    const ph = m.anim.walkPhase;
    cr.legs.forEach(([, a, b, c], i) => {
      const k = i % 4, s = i < (hermit ? 3 : 4) ? -1 : 1;
      const p = ph + k * Math.PI * 0.5 + (s > 0 ? Math.PI : 0);
      const amp = Math.min(1, Math.abs(w) * 3);
      a.rotation.z = 0.5 + Math.max(0, Math.sin(p)) * 0.45 * amp + Math.sin(ph * 0.3 + i) * 0.03;
      a.rotation.y = Math.cos(p) * 0.25 * amp;
      b.rotation.z = -1.0 - Math.max(0, Math.sin(p)) * 0.3 * amp;
      c.rotation.z = -0.6 + Math.sin(p) * 0.15 * amp;
    });
    const pinch = m.anim.pinch ?? 0, raise = m.anim.raise ?? 0;
    cr.claws.forEach(([, ar, pv, mov], i) => {
      ar.rotation.z = 0.35 + raise * 0.9 + Math.sin(ph * 0.5 + i * 2) * 0.04;
      pv.rotation.z = 0.2 + raise * 0.5;
      mov.rotation.z = 0.32 - pinch * 0.32 + Math.max(0, Math.sin(ph * 0.4 + i * 3)) * 0.1 * (1 - pinch);
    });
  };
  return kitAsset(name, body, pg, {
    length: W * 2.6, mouth: [0, 0, D * 1.1], eye: [W * 0.2, Ht * 1.15, D * 1.05], eyeR: 0.011,
    amp: 0, freq: 1, parts, animate, clearcoat: 0.6, clearcoatRough: 0.28,
    anchors: { clawL: [-W * 1.4, Ht, D * 1.4], clawR: [W * 1.4, Ht, D * 1.4] },
  });
}
const crab = () => crabBase('crab', { shell: ['#5a1008', '#8a1e0c', '#b83014', '#d8502a', '#f08a50'], leg: ['#e0603a', '#c84626', '#a0341a'], tip: '#1a0c08', spots: '#f8b080', eye: '#202020' });

// ============================================================================================ hermit crab
// Friendly hermit crab facing +x inside a spiral voxel-ridged shell, with big snipping claws (cuts fishing lines).
function hermit(): SpeciesAsset {
  const base = crabBase('hermit_body', { shell: ['#6a1a0a', '#a03a14', '#d0602a', '#f08a40', '#ffc080'], leg: ['#f08a50', '#d86a34', '#b04a20'], tip: '#fff0d8', spots: '#fff0c0', eye: '#101010' }, true);
  // spiral shell: a cone wound round a helix, ridged, cream with brown + violet bands
  const pg = new Page(256, 128), K = new Kit(pg);
  const shR = pg.alloc(200, 64), lipR = pg.alloc(32, 16);
  paintRect(pg, shR, (u, v, i, j) => {
    // along the whorl (v): growth ribs + spiral colour bands; around (u): banded cream/brown/violet
    const rib = Math.max(0, Math.sin(v * 260));
    const bandU = Math.sin(u * TAU * 3 + 0.6);
    let c = grad(['#3a1e2a', '#7a4a4a', '#c08a60', '#e8c8a0', '#fff0dc'])(0.25 + 0.5 * (0.5 + 0.5 * Math.cos(u * TAU)) + rib * 0.18, i, j);
    if (bandU > 0.55) c = mix(c, C('#8a4a2a'), 0.75);
    if (bandU < -0.8) c = mix(c, C('#6a4a8a'), 0.5);
    if (rib > 0.9) c = shade(c, 1.12);
    return [c, 1, 0.3, rib * 0.8];
  });
  paintSwatch(pg, lipR, ['#ffe8f0', '#f0b8c8', '#c07890'], 0.2);
  // conical helix: whorls shrink toward the apex, which points back and up
  const axis = norm([-0.75, 0.62, 0]), u1 = norm(cross(axis, [0, 0, 1])), u2 = norm(cross(axis, u1));
  const sb: V3 = [-0.02, 0.05, 0];
  const path: V3[] = [];
  const N = 60, turns = 3.1;
  for (let i = 0; i <= N; i++) {
    const f = i / N, phi = f * turns * TAU + 0.6;
    const rho = 0.06 * Math.pow(1 - f, 1.1) + 0.002;
    path.push(add(add(sb, scale(axis, 0.17 * Math.pow(f, 0.8))), add(scale(u1, Math.cos(phi) * rho), scale(u2, Math.sin(phi) * rho))));
  }
  const ft = K.lo.count;
  K.lo.tube(path, (t) => (0.046 * Math.pow(1 - t, 1.2) + 0.003) * (1 + 0.04 * Math.max(0, Math.sin(t * 120))), 20, pg.reg(shR), K.newG(), { capEnd: true });
  K.tag(ft, (i, A) => { A.ao[i] = 1; });
  const rings: { pts: V3[]; v: number }[] = [];
  {
    // flared, pearly aperture lip around the first ring
    const p0 = path[0], d0 = norm(sub(path[0], path[1]));
    const a1 = norm(cross(d0, [0, 0, 1])), a2 = norm(cross(d0, a1));
    for (const [k, rr, off] of [[0, 0.058, 0], [1, 0.064, 0.006], [2, 0.05, 0.004]] as [number, number, number][]) {
      rings.push({ pts: Kit.ring(add(p0, scale(d0, off)), a1, a2, rr, rr, 18), v: k / 2 });
    }
  }
  K.loftPart(rings, lipR);
  const shell = K.geometry().geo;
  const shellTex = pg.textures(2);
  const parts0 = base.parts!;
  base.parts = (m: FishModel) => {
    // the crab body faces the camera by default; turn it to face +x and sit it in the shell mouth
    const body = new THREE.Group();
    body.add(m.mesh);
    parts0(m);
    const kids = m.group.children.filter((o) => o !== body);
    for (const o of kids) body.add(o);
    body.rotation.y = Math.PI / 2;
    body.position.set(0.02, 0.0, 0);
    m.group.add(body);
    const sm = m.makeMaterial({ map: shellTex.map, normalMap: shellTex.normalMap, roughnessMap: shellTex.roughnessMap, emissiveMap: null });
    const sh = new THREE.Mesh(shell, sm);
    sh.castShadow = true;
    sh.position.set(-0.03, 0.0, 0);
    m.group.add(sh);
    m.parts.shell = sh;
  };
  base.name = 'hermit';
  base.length = 0.36;
  base.mouth.set(0.14, 0.02, 0); base.eye.set(0.12, 0.06, 0.02);
  return base;
}
function centroidOf(ps: V3[]): V3 { let x = 0, y = 0, z = 0; for (const p of ps) { x += p[0]; y += p[1]; z += p[2]; } return [x / ps.length, y / ps.length, z / ps.length]; }

// ============================================================================================ sea turtle
// Green sea turtle: heart-shaped domed carapace with radiating scutes, pale plastron, scaly beaked head, long
// wing-like fore-flippers that beat slowly (child meshes) and short rear paddles.
function seaTurtle(): SpeciesAsset {
  const pg = new Page(512, 256), K = new Kit(pg);
  const shR = pg.alloc(256, 128), skinR = pg.alloc(96, 64), headR = pg.alloc(96, 64), flipR = pg.alloc(96, 48), eyeR = pg.alloc(24, 24), beakR = pg.alloc(16, 16);
  const SL = 0.82, SW = 0.34, SH = 0.17, SB = 0.07;
  // scute layout in top view (x along, z across): vertebral row + costals + marginals
  const scutes: [number, number][] = [];
  for (let k = 0; k < 5; k++) scutes.push([0.3 - k * 0.15, 0]);
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) scutes.push([0.24 - k * 0.16, s * 0.17]);
  const shellCol = (x: number, z: number, top: number, i: number, j: number): [RGB, number] => {
    const rim = Math.hypot(x / (SL / 2), z / SW);
    if (rim > 0.86 || top < 0.1) {
      // marginal scutes
      const ang = Math.atan2(z, x), seg = Math.abs(((ang * 24 / TAU) % 1 + 1) % 1 - 0.5);
      let c = grad(['#3a3418', '#5a4a20', '#7a6428'])(0.5 + 0.3 * Math.sin(ang * 12), i, j);
      if (seg < 0.06) c = C('#2a2210');
      if (top < -0.1) c = grad(['#e8d8a0', '#d8c080'])(0.5, i, j);
      return [c, seg < 0.06 ? 0 : 0.5];
    }
    let best = 1e9, second = 1e9, bi = 0;
    for (let k = 0; k < scutes.length; k++) {
      const d = Math.hypot((x - scutes[k][0]) * 1.1, z - scutes[k][1]);
      if (d < best) { second = best; best = d; bi = k; } else if (d < second) second = d;
    }
    const edge = second - best;
    const sc = scutes[bi];
    // radiating streaks from each scute's growth centre
    const ang = Math.atan2(z - sc[1], x - sc[0]);
    const streak = Math.sin(ang * 9 + hash2(bi, 1, 2) * 6) * 0.5 + 0.5;
    let c = grad(['#2a2410', '#4a3c18', '#6a5420', '#8a7030', '#b89a48'])(0.25 + streak * 0.5 + (1 - best / 0.12) * 0.15, i, j);
    if (edge < 0.012) c = C('#e0c070');
    else if (edge < 0.02) c = C('#2a2410');
    return [c, edge < 0.02 ? 0 : 0.6 * (1 - best / 0.15)];
  };
  const shellPt = (f: number, th: number, k = 1): V3 => {
    // f: 0 front .. 1 back; th around (0 = top)
    const x = SL / 2 - f * SL;
    const e = Math.pow(Math.sin(Math.PI * Math.min(1, f * 1.08 + 0.02)), 0.6) * (1 - 0.25 * Math.max(0, f - 0.6));
    const w = SW * e * k, s = Math.sin(th), co = Math.cos(th);
    const ex = Math.sign(s) * Math.pow(Math.abs(s), 0.7);
    const y = co >= 0 ? SH * Math.pow(co, 1.3) * (0.3 + 0.7 * e) * k : SB * co * e * k;
    return [x, y, ex * w];
  };
  paintRect(pg, shR, (u, v, i, j) => {
    const f = 1 - u, th = v * TAU;
    const p = shellPt(f, th);
    const [c, h] = shellCol(p[0], p[2], Math.cos(th), i, j);
    return [c, 1, 0.42, h];
  });
  const skin = (u: number, v: number, i: number, j: number, cols: string[]): [RGB, number, number, number] => {
    const [f1, f2] = worley(i, j * 1.3, 4.2, 5);
    let c = grad(cols)(0.5 + 0.5 * Math.cos(v * TAU) * -0.6 + vnoise(i * 0.1, j * 0.1, 3) * 0.2, i, j);
    const e = f2 - f1;
    if (e < 0.9) c = shade(c, 0.62); else if (f1 < 1.2) c = shade(c, 1.12);
    return [c, 1, 0.5, e < 0.9 ? 0 : 0.6];
  };
  paintRect(pg, skinR, (u, v, i, j) => skin(u, v, i, j, ['#3a3420', '#5a5030', '#8a7a48', '#c8b890', '#e8dcc0']));
  paintRect(pg, headR, (u, v, i, j) => {
    const r = skin(u, v, i, j, ['#3a3018', '#5a4a22', '#7a6430', '#b09860', '#e0d0a8']);
    // pale scale edges on the head shields
    return r;
  });
  paintRect(pg, flipR, (u, v, i, j) => {
    const [f1, f2] = worley(i * 1.2, j, 4, 9);
    let c = grad(['#2a2412', '#4a3e20', '#6a5a30', '#c8b890'])(0.3 + (f1 / 4) * 0.4, i, j);
    if (f2 - f1 < 0.8) c = C('#e0d0a0');
    if (v > 0.5) c = mix(c, C('#d8c8a0'), 0.5);
    return [c, 1, 0.45, f2 - f1 < 0.8 ? 0 : 0.7];
  });
  paintEye(pg, eyeR, { iris: ['#1a1008', '#4a3010', '#8a6020', '#c09040'], pupil: 0.5, sclera: '#d8d0b0', irisR: 0.8 });
  paintSwatch(pg, beakR, ['#e0d0a0', '#a89060', '#5a4a30'], 0.3);

  // carapace (top shell + plastron in one loft)
  const rings: { pts: V3[]; v: number }[] = [];
  for (let i = 1; i < 30; i++) { const f = i / 30, pts: V3[] = []; for (let k = 0; k <= 28; k++) pts.push(shellPt(f, (k / 28) * TAU)); rings.push({ pts, v: f }); }
  // remap v so the painter's u (along) matches f: loftPart maps ring v down the rect; we paint with u = 1 - f along x instead
  const from = K.lo.count;
  K.loftPart(rings, shR, { start: [SL / 2 + 0.01, 0.01, 0], end: [-SL / 2 - 0.01, 0.0, 0] });
  const sreg = pg.reg(shR);
  K.tag(from, (i) => {
    const p = K.lo.pos(i);
    const f = clamp((SL / 2 - p[0]) / SL, 0, 1);
    // around angle from the ring geometry
    const yy = p[1], zz = p[2];
    let th = Math.atan2(zz, yy); if (th < 0) th += TAU;
    K.lo.UV[i * 2] = sreg.x + (1 - f) * sreg.w;
    K.lo.UV[i * 2 + 1] = 1 - (sreg.y + (th / TAU) * sreg.h);
  });
  // head + neck
  const hr: { pts: V3[]; v: number }[] = [];
  const HX0 = SL / 2 - 0.12, HL = 0.3;
  for (let i = 0; i <= 16; i++) {
    const f = i / 16;
    const x = HX0 + f * HL;
    const r = f < 0.45 ? 0.07 - f * 0.03 : 0.056 + Math.sin((f - 0.45) / 0.55 * Math.PI) * 0.018 - Math.pow(Math.max(0, f - 0.8) / 0.2, 2) * 0.05;
    hr.push({ pts: Kit.ring([x, 0.02 + f * 0.02 - Math.max(0, f - 0.8) * 0.06, 0], [0, 0, 1], [0, 1, 0], r * 0.85, r, 16, 2.2, r * 0.8), v: f });
  }
  K.loftPart(hr, headR, { end: [HX0 + HL + 0.012, 0.025, 0] });
  // beak ridge + eyes
  K.blob([HX0 + HL - 0.01, 0.02, 0], [0.025, 0.022, 0.03], beakR, { seg: 10 });
  const ereg = pg.reg(eyeR);
  for (const s of [-1, 1]) {
    const c: V3 = [HX0 + HL * 0.72, 0.06, s * 0.035];
    const er = 0.016;
    const fe = K.lo.count;
    K.blob(c, [er, er, er * 0.8], eyeR, { seg: 12 });
    K.tag(fe, (i, A) => {
      const q = sub(K.lo.pos(i), c);
      K.lo.UV[i * 2] = ereg.x + clamp(0.5 + q[0] / (2 * er), 0, 1) * ereg.w;
      K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - q[1] / (2 * er), 0, 1) * ereg.h);
      A.eye[i * 4] = c[0]; A.eye[i * 4 + 1] = c[1]; A.eye[i * 4 + 2] = c[2]; A.eye[i * 4 + 3] = 1;
    });
  }
  // tail stub
  K.tube([[-SL / 2 + 0.05, -0.01, 0], [-SL / 2 - 0.04, -0.02, 0], [-SL / 2 - 0.09, -0.03, 0]], (t) => 0.03 * (1 - t * 0.8), 8, skinR, { capEnd: true });
  const body = K.geometry().geo;

  // flippers: flat lofted wings along local +z (out from the body), pivot at the shoulder
  const flipper = (len: number, chord: number, thick: number, sweep: number) => {
    const FK = new Kit(pg);
    const fr: { pts: V3[]; v: number }[] = [];
    for (let i = 0; i <= 14; i++) {
      const f = i / 14;
      const c = chord * (f < 0.15 ? 0.7 + f * 2 : 1 - Math.pow((f - 0.15) / 0.85, 1.6) * 0.85);
      const x = -sweep * f * f * len - c * 0.2;
      fr.push({ pts: Kit.ring([x, -f * 0.03, f * len], [1, 0, 0], [0, 1, 0], c / 2, thick * (1 - f * 0.75), 12, 1.8), v: f });
    }
    FK.loftPart(fr, flipR, { start: [0, 0, -0.005], end: [-sweep * len - chord * 0.1, -0.03, len + 0.01] });
    return FK.geometry().geo;
  };
  const front = flipper(0.48, 0.15, 0.03, 0.45), rear = flipper(0.2, 0.12, 0.025, 0.2);
  const parts = (m: FishModel) => {
    const fl: THREE.Object3D[] = [];
    for (const [g, x, y, isFront] of [[front, SL * 0.22, -0.02, true], [rear, -SL * 0.36, -0.03, false]] as [THREE.BufferGeometry, number, number, boolean][]) {
      for (const s of [1, -1]) {
        const piv = new THREE.Object3D();
        piv.position.set(x, y, s * SW * 0.7);
        const ms = new THREE.Mesh(g, m.material); ms.castShadow = true; ms.customDepthMaterial = m.asset.depthMat;
        if (s < 0) ms.scale.z = -1;
        piv.add(ms); m.group.add(piv);
        piv.userData = { s, isFront };
        fl.push(piv);
      }
    }
    (m as unknown as { flippers: THREE.Object3D[] }).flippers = fl;
    m.anim.stroke = m.seed;
  };
  const animate = (m: FishModel, dt: number) => {
    const fl = (m as unknown as { flippers: THREE.Object3D[] }).flippers;
    if (!fl) return;
    const sp = Math.abs(m.speed);
    m.anim.stroke = (m.anim.stroke ?? 0) + dt * (0.9 + sp * 0.9);
    const ph = m.anim.stroke;
    for (const p of fl) {
      const { s, isFront } = p.userData as { s: number; isFront: boolean };
      if (isFront) {
        const a = Math.sin(ph * 2.2);
        p.rotation.set(-s * a * 0.75, s * (0.35 + Math.cos(ph * 2.2) * 0.25), 0);
      } else {
        p.rotation.set(-s * Math.sin(ph * 2.2 + 1) * 0.2, s * 0.9, 0);
      }
    }
  };
  return kitAsset('sea_turtle', body, pg, {
    length: 1.2, mouth: [HX0 + HL + 0.01, 0.02, 0], eye: [HX0 + HL * 0.72, 0.06, 0.035], eyeR: 0.016,
    amp: 0, freq: 0.5, parts, animate, clearcoat: 0.5, clearcoatRough: 0.35,
    anchors: { back: [0, SH + 0.05, 0] },
  });
}

// ============================================================================================ stingrays
// A flat round disc that ripples its wing margins (swim mode 2), dorsal eyes with spiracles, pelvic lobes and a
// whip tail with a barb. Top +y: tilt the model toward the camera to show its back.
function stingray(name: string, pal: { top: string[]; spot: string; spot2?: string; belly: string }, spotFn: (i: number, j: number) => number): SpeciesAsset {
  const pg = new Page(256, 256), K = new Kit(pg);
  const dR = pg.alloc(160, 128), tailR = pg.alloc(16, 64), eyeR = pg.alloc(16, 16), barbR = pg.alloc(8, 16);
  const DL = 0.74, DW = 0.38;
  const discPt = (f: number, th: number): V3 => {
    const x = DL / 2 - f * DL;
    const ff = Math.min(1, f * 1.0);
    const w = DW * Math.pow(Math.sin(Math.PI * ff), 0.75) * (1 + 0.06 * Math.sin(ff * Math.PI * 2));
    const s = Math.sin(th), co = Math.cos(th);
    const ex = Math.sign(s) * Math.pow(Math.abs(s), 0.6);
    const hc = 0.06 * Math.pow(Math.sin(Math.PI * ff), 1.2);
    const y = co >= 0 ? hc * Math.pow(co, 2.2) + 0.004 : 0.022 * Math.pow(Math.sin(Math.PI * ff), 1.2) * co - 0.002;
    return [x, y, ex * w];
  };
  paintRect(pg, dR, (u, v, i, j) => {
    const f = 1 - u, th = v * TAU, top = Math.cos(th);
    if (top < 0) return [grad([pal.belly, '#f8f4ec'])(0.5 - top * 0.5, i, j), 1, 0.4, 0];
    const p = discPt(f, th);
    let c = grad(pal.top)(0.3 + top * 0.5 + vnoise(p[0] * 30, p[2] * 30, 2) * 0.3, i, j);
    const sp = spotFn(p[0] * 300, p[2] * 300);
    if (sp > 0) c = sp > 1.5 && pal.spot2 ? C(pal.spot2) : C(pal.spot);
    // eye mounds + spiracles darker
    return [c, 1, 0.32, sp > 0 ? 0.5 : vnoise(i * 0.4, j * 0.4, 5) * 0.4];
  });
  paintRect(pg, tailR, (u, v, i, j) => [grad([pal.top[1], pal.top[0]])(v, i, j), 1, 0.35, 0]);
  paintEye(pg, eyeR, { iris: ['#1a1a08', '#5a5a20', '#a0a040', '#e0e080'], pupil: 0.4, sclera: '#3a3a30', irisR: 0.85, slit: -0.5 });
  paintSwatch(pg, barbR, ['#f0e8d0', '#c8b890', '#6a5a40'], 0.3);
  const rings: { pts: V3[]; v: number }[] = [];
  for (let i = 1; i < 34; i++) { const f = i / 34, pts: V3[] = []; for (let k = 0; k <= 36; k++) pts.push(discPt(f, (k / 36) * TAU)); rings.push({ pts, v: f }); }
  const from = K.lo.count;
  K.loftPart(rings, dR, { start: [DL / 2 + 0.005, 0.003, 0], end: [-DL / 2 - 0.005, 0.003, 0] });
  const dreg = pg.reg(dR);
  K.tag(from, (i) => {
    const p = K.lo.pos(i);
    const f = clamp((DL / 2 - p[0]) / DL, 0, 1);
    let th = Math.atan2(p[2], p[1] - 0.003); if (th < 0) th += TAU;
    K.lo.UV[i * 2] = dreg.x + (1 - f) * dreg.w;
    K.lo.UV[i * 2 + 1] = 1 - (dreg.y + (th / TAU) * dreg.h);
  });
  // eyes on top
  const ereg = pg.reg(eyeR);
  for (const s of [-1, 1]) {
    const c: V3 = [DL * 0.28, 0.045, s * 0.06], er = 0.017;
    const fe = K.lo.count;
    K.blob(c, [er, er * 0.8, er], eyeR, { seg: 12 });
    K.tag(fe, (i, A) => {
      const q = sub(K.lo.pos(i), c);
      K.lo.UV[i * 2] = ereg.x + clamp(0.5 + q[0] / (2 * er), 0, 1) * ereg.w;
      K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - q[2] * s / (2 * er), 0, 1) * ereg.h);
      A.eye[i * 4] = c[0]; A.eye[i * 4 + 1] = c[1]; A.eye[i * 4 + 2] = c[2]; A.eye[i * 4 + 3] = 1;
    });
  }
  // pelvic lobes
  for (const s of [-1, 1]) K.blob([-DL * 0.47, 0.0, s * 0.06], [0.07, 0.014, 0.045], dR, { seg: 10 });
  // whip tail + barb
  const path: V3[] = [];
  for (let i = 0; i <= 18; i++) { const f = i / 18; path.push([-DL / 2 + 0.02 - f * 0.72, 0.01 - f * 0.01, 0]); }
  const ft = K.lo.count;
  K.lo.tube(path, (t) => 0.022 * Math.pow(1 - t, 1.3) + 0.002, 6, pg.reg(tailR), K.newG(), { capEnd: true });
  K.tag(ft, (i, A) => { const p = K.lo.pos(i); A.swim[i * 4 + 2] = clamp((-DL / 2 - p[0]) / 0.72, 0, 1); });
  const fb = K.lo.count;
  K.cone([-DL / 2 - 0.25, 0.022, 0], [-1, 0.2, 0], 0.09, 0.006, barbR, 4);
  K.tag(fb, (i, A) => { A.swim[i * 4 + 2] = 0.35; });
  const { geo } = K.geometry();
  return kitAsset(name, geo, pg, {
    length: DL + 0.72, mouth: [DL * 0.4, -0.01, 0], eye: [DL * 0.28, 0.045, 0.06], eyeR: 0.017,
    mode: 2, shape: [DL / 2, DL, 0.9, DW], shape2: [2, 4, 0.0, 0.05], amp: 0.035, freq: 0.6, freqK: 0.6,
    clearcoat: 0.6, clearcoatRough: 0.3,
  });
}
const stingrayPolka = () => stingray('stingray', { top: ['#0a0a0c', '#16161a', '#24242a', '#34343a'], spot: '#f4f0e0', spot2: '#d8c890', belly: '#e8e0d0' }, (x, y) => {
  const [f1, , id] = worley(x, y, 9, 21); return f1 < 2.2 + id * 1.6 ? (id > 0.8 ? 2 : 1) : 0;
});
const stingrayBlue = () => stingray('stingray_blue', { top: ['#1a3a4a', '#245468', '#2e6a80', '#4a8aa0'], spot: '#6ad8ff', spot2: '#1a2a3a', belly: '#e0e8e8' }, (x, y) => {
  const [f1, f2, id] = worley(x, y, 7, 33); const m = vnoise(x * 0.05, y * 0.05, 4);
  return f1 < 1.6 + id && id > 0.35 ? 1 : f2 - f1 < 0.9 && m > 0.55 ? 2 : 0;
});

// ============================================================================================ sea cucumber
// A fat spotted sausage that inches along by peristalsis (swim mode 3), red papillae spikes along its back and
// a crown of branched feeding tentacles at the mouth end.
function seaCucumber(): SpeciesAsset {
  const pg = new Page(256, 128), K = new Kit(pg);
  const bodyR = pg.alloc(160, 64), papR = pg.alloc(8, 16), tentR = pg.alloc(8, 16);
  const L = 0.55, R0 = 0.065;
  const rad = (f: number) => R0 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.02 + f * 0.96)), 0.32) * (1 + 0.06 * Math.sin(f * 9 + 1));
  paintRect(pg, bodyR, (u, v, i, j) => {
    const top = Math.cos(v * TAU);
    let c = grad(['#4a2a14', '#7a4a20', '#a8702e', '#c89850', '#e8c890'])(0.25 + (1 - top) * 0.35 + vnoise(i * 0.15, j * 0.2, 3) * 0.25, i, j);
    const [f1, , id] = worley(i, j * 1.4, 7, 13);
    if (f1 < 2.2 + id * 1.2 && top > -0.4) c = mix(c, C('#1a0e08'), 0.85);
    else if (f1 < 3.4 && top > -0.4) c = shade(c, 0.85);
    if (top < -0.55) c = mix(c, C('#e0c8a0'), 0.6);
    return [c, 1, 0.55, vnoise(i * 0.5, j * 0.5, 7)];
  });
  paintSwatch(pg, papR, ['#ffd0a0', '#ff6a30', '#d02a10', '#801808'], 0.4);
  paintSwatch(pg, tentR, ['#fff0d0', '#e8c890', '#a87040'], 0.5);
  const rings: { pts: V3[]; v: number }[] = [];
  for (let i = 1; i < 40; i++) {
    const f = i / 40, x = L / 2 - f * L, r = rad(f);
    rings.push({ pts: Kit.ring([x, R0 * 0.9, 0], [0, 0, 1], [0, 1, 0], r * 1.05, r, 20, 2.0, r * 0.85), v: f });
  }
  K.loftPart(rings, bodyR, { start: [L / 2 + 0.012, R0 * 0.9, 0], end: [-L / 2 - 0.01, R0 * 0.9, 0] });
  // papillae along the back and flanks
  for (let n = 0; n < 22; n++) {
    const f = 0.12 + (n / 22) * 0.78, th = ((n * 2.39) % 2.6) - 1.3;
    const x = L / 2 - f * L, r = rad(f);
    const p: V3 = [x, R0 * 0.9 + Math.cos(th) * r * 0.98, Math.sin(th) * r * 1.08];
    K.cone(p, [0.15, Math.cos(th), Math.sin(th)], 0.028 + hash2(n, 1, 5) * 0.022, 0.008, papR, 5, { flutter: 0.15, phase: n });
  }
  // feeding crown
  for (let n = 0; n < 10; n++) {
    const a = (n / 10) * TAU;
    const base: V3 = [L / 2 + 0.004, R0 * 0.9 + Math.cos(a) * 0.022, Math.sin(a) * 0.024];
    K.cone(base, [1, Math.cos(a) * 0.9, Math.sin(a) * 0.9], 0.035, 0.005, tentR, 4, { flutter: 1, phase: n * 0.7 });
  }
  const { geo } = K.geometry();
  return kitAsset('sea_cucumber', geo, pg, {
    length: L, mouth: [L / 2, R0 * 0.8, 0], eye: [L / 2 - 0.03, R0 * 1.4, 0], mode: 3,
    shape: [L / 2, L, 1.3, 0], shape2: [2, 3, 0.05, 0], jaw: [0, 0, 0, R0 * 0.8], amp: 0.06, freq: 0.35, freqK: 0.2,
    clearcoat: 0.7, clearcoatRough: 0.25, uwo: { rim: 0.35, sss: [1, 0.7, 0.5], sssK: 0.6 },
  });
}

// ============================================================================================ starfish
// Chocolate-chip sea star: five plump arms, cream and coral red, studded with dark voxel "chips". Its top faces
// +z (the camera): it clings to rock faces or lies tilted on the seabed.
function starfish(): SpeciesAsset {
  const pg = new Page(256, 128), K = new Kit(pg);
  const armR = pg.alloc(96, 64), chipR = pg.alloc(8, 8), discR = pg.alloc(48, 48);
  const AR = 0.2, W0 = 0.055;
  paintRect(pg, armR, (u, v, i, j) => {
    // v: centre -> tip along the arm, u around (0 = top ridge)
    const top = Math.cos(u * TAU);
    let c = grad(['#7a1a10', '#c03a20', '#e8603a', '#f4c8a0', '#fff0dc'])(0.15 + (top > 0 ? (1 - top) * 0.5 : 0.85) + v * 0.15, i, j);
    if (top > 0.3) c = dmix(c, C('#d8402a'), smoothstep(0.35, 0.9, v) * 0.9 + (Math.abs(top - 0.75) < 0.12 ? 0.4 : 0), i, j);
    if (top < -0.2) c = C('#f0d8b8');
    const pore = ((i + (j >> 1)) % 4) === 0 && (j % 3) === 0;
    if (pore && top > -0.1) c = shade(c, 0.88);
    return [c, 1, 0.5, pore ? 0.2 : 0.5];
  });
  paintSwatch(pg, chipR, ['#3a1408', '#1e0a06', '#120604'], 0.35);
  paintRect(pg, discR, (u, v, i, j) => [grad(['#f4dcc0', '#e8a07a', '#d0503a'])(Math.hypot(u - 0.5, v - 0.5) * 1.6, i, j), 1, 0.5, 0]);
  for (let a = 0; a < 5; a++) {
    const ang = Math.PI / 2 + (a / 5) * TAU;
    const dir: V3 = [Math.cos(ang), Math.sin(ang), 0], side: V3 = [-Math.sin(ang), Math.cos(ang), 0];
    const rings: { pts: V3[]; v: number }[] = [];
    for (let i = 0; i <= 14; i++) {
      const f = i / 14, w = W0 * (1 - f * 0.78) * (f < 0.1 ? 1 + (0.1 - f) * 4 : 1), h = w * 0.9;
      const c = add(scale(dir, f * AR), [0, 0, 0]);
      const pts: V3[] = [];
      for (let k = 0; k <= 16; k++) {
        const th = (k / 16) * TAU, s = Math.sin(th), co = Math.cos(th);
        pts.push(add(add(c, scale(side, s * w)), [0, 0, co >= 0 ? Math.pow(co, 0.8) * h : co * h * 0.25]));
      }
      rings.push({ pts, v: f });
    }
    const from = K.lo.count;
    K.loftPart(rings, armR, { end: add(scale(dir, AR + 0.008), [0, 0, 0.004]) });
    K.tag(from, (i, A) => { const p = K.lo.pos(i); const f = Math.hypot(p[0], p[1]) / AR; A.swim[i * 4] = Math.max(0, f - 0.4) * 0.6; A.swim[i * 4 + 1] = a * 1.3; });
    // chocolate chips along the ridge and flanks (voxel knobs)
    for (let k = 0; k < 6; k++) {
      const f = 0.12 + k * 0.14, w = W0 * (1 - f * 0.78);
      for (const off of k % 2 ? [0] : [-0.55, 0.55]) {
        const p = add(add(scale(dir, f * AR), scale(side, off * w)), [0, 0, w * 0.9 * (off ? 0.75 : 1)]);
        const sz = w * (off ? 0.32 : 0.45);
        const fb = K.lo.count;
        K.lo.box(p, [sz, sz, sz * 0.9], pg.reg(chipR), undefined, new THREE.Matrix4().makeRotationZ(ang + 0.785));
        K.tag(fb, (i, A) => { A.swim[i * 4] = Math.max(0, f - 0.4) * 0.6; A.swim[i * 4 + 1] = a * 1.3; });
      }
    }
  }
  // central disc dome
  K.blob([0, 0, 0.018], [W0 * 1.25, W0 * 1.25, 0.04], discR, { seg: 16 });
  for (let k = 0; k < 5; k++) { const ang = (k / 5) * TAU; K.lo.box([Math.cos(ang) * 0.03, Math.sin(ang) * 0.03, 0.05], [0.016, 0.016, 0.014], pg.reg(chipR)); }
  K.lo.box([0, 0, 0.058], [0.02, 0.02, 0.016], pg.reg(chipR));
  const { geo } = K.geometry();
  return kitAsset('starfish', geo, pg, {
    length: AR * 2, mouth: [0, 0, 0], eye: [0, 0, 0.05], amp: 0, freq: 0.3,
    shape: [AR, AR * 2, 0, 0], shape2: [2, 0.6, 0.05, 0], clearcoat: 0.6, clearcoatRough: 0.35,
  });
}

export const SPECIALS: Record<string, () => SpeciesAsset> = {
  jellyfish, crab, hermit, sea_turtle: seaTurtle, stingray: stingrayPolka, stingray_blue: stingrayBlue,
  sea_cucumber: seaCucumber, starfish,
};
