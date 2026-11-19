// Crabs, facing the camera (+z) and walking sideways along x.
//   crab    red rock crab (Cancer): a fan-shaped carapace wider than long, nine anterolateral teeth a side, five
//           small frontal teeth between the orbits, the H-shaped groove over the heart, granules along the margin;
//           eyes on short stalks in their orbits, the square mouthpart plate, heavy chelipeds (merus, carpus, a
//           swollen palm, black-tipped fingers with white denticles) and four jointed walking legs a side with
//           pointed dactyls
//   hermit  white-spotted hermit (Dardanus) body: a narrow shield, a bigger left claw, red legs with black-ringed
//           white spots and fringes of bristles, in a whelk shell (special.ts adds the shell)
// Limbs are per-instance child meshes on the instance material; the rig keeps the old shape
// (m.crab = { legs: [root, a, b, c][], claws: [root, arm, palm, finger][] }) so the behaviours drive it the same.
import * as THREE from 'three';
import { Kit } from './kit';
import { Page, paintEye, C, mix, shade } from './page';
import type { V3 } from '../gfx/loft';
import type { FishModel, SpeciesAsset } from './model';
import type { RGB } from '../gfx/px';
import { kitAsset, paintRect } from './kitutil';
import { smoothstep } from './curve';
import { clamp } from '../core/math';

const TAU = Math.PI * 2;

export interface CrabPal { shell: [string, string, string, string]; belly: string; leg: [string, string, string]; tip: string; gran: string; eye: string; spots?: string; ring?: string }

/** polar radius of a closed top-view outline (x, z) around a centre, sampled by angle */
function polar(pts: [number, number][], cx: number, cz: number, N = 360) {
  const R = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const th = (k / N) * TAU, dx = Math.cos(th), dz = Math.sin(th);
    let best = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % pts.length];
      const ex = x1 - x0, ez = z1 - z0, den = dx * ez - dz * ex;
      if (Math.abs(den) < 1e-12) continue;
      const ax = x0 - cx, az = z0 - cz;
      const t = (ax * ez - az * ex) / den, s = (ax * dz - az * dx) / den;
      if (s >= 0 && s <= 1 && t > best) best = t;
    }
    R[k] = best;
  }
  return (th: number) => { const f = ((th / TAU) % 1 + 1) % 1 * N, i = Math.floor(f), t = f - i; return R[i % N] * (1 - t) + R[(i + 1) % N] * t; };
}

interface LimbGeo { geo: THREE.BufferGeometry; len: number }

export function crabBase(name: string, pal: CrabPal, hermit = false): SpeciesAsset {
  const pg = new Page(256, 256), K = new Kit(pg);
  const topR = pg.alloc(128, 96), botR = pg.alloc(48, 32), legR = pg.alloc(32, 48), clawR = pg.alloc(48, 48), fingR = pg.alloc(16, 32), eyeR = pg.alloc(16, 16), stalkR = pg.alloc(8, 12), mouthR = pg.alloc(24, 16);
  const W = hermit ? 0.075 : 0.17, D = hermit ? 0.1 : 0.12, Ht = hermit ? 0.045 : 0.07;
  const shell = pal.shell.map(C) as RGB[];
  // ------------------------------------------------------------------------------------------ outline (top view)
  // right half from the front centre to the back centre, in units of (W, D); mirrored for the left
  const half: [number, number][] = [[0, 1.0]];
  if (!hermit) {
    // frontal teeth, the orbit notch
    half.push([0.07, 1.03], [0.12, 0.99], [0.17, 1.02], [0.22, 0.97], [0.26, 0.9], [0.31, 0.95]);
    // nine anterolateral teeth along an arc out to the widest point
    for (let i = 0; i < 9; i++) {
      const a0 = 72 - i * 8, a1 = a0 - 4;
      const P = (a: number, k: number): [number, number] => [Math.cos((a * Math.PI) / 180) * k, -0.08 + Math.sin((a * Math.PI) / 180) * 1.02 * k];
      half.push(P(a0, 1.0), P(a1, 1.07 - i * 0.004));
    }
    half.push([0.99, -0.16], [0.9, -0.42], [0.74, -0.7], [0.55, -0.9], [0.36, -0.99], [0.18, -1.0], [0, -1.0]);
  } else {
    // hermit shield: a narrow rounded front, rostrum, straight sides
    half.push([0.15, 0.99], [0.3, 0.9], [0.6, 0.8], [0.9, 0.55], [1.0, 0.1], [0.96, -0.4], [0.8, -0.8], [0.5, -0.98], [0.2, -1.0], [0, -1.0]);
  }
  const outline: [number, number][] = [...half.map(([x, z]) => [x * W, z * D] as [number, number]), ...half.slice(1, -1).reverse().map(([x, z]) => [-x * W, z * D] as [number, number])];
  const CZ = hermit ? 0 : -0.05 * D;
  const rimR = polar(outline, 0, CZ);
  const domeY = (s: number, z: number) => Ht * 0.3 + Ht * 0.7 * Math.pow(Math.max(0, 1 - s * s), 0.55) - 0.12 * Ht * smoothstep(0, D, z);
  const shellPt = (th: number, s: number, under = 0): V3 => {
    const r = rimR(th) * s, x = Math.cos(th) * r, z = CZ + Math.sin(th) * r;
    return [x, under ? under : domeY(s, z), z];
  };
  // ------------------------------------------------------------------------------------------ paint
  const XS = W * 1.1, ZS0 = -D * 1.1, ZS1 = D * 1.12;
  paintRect(pg, topR, (u, v) => {
    const x = -XS + u * 2 * XS, z = ZS0 + v * (ZS1 - ZS0);
    const th = Math.atan2(z - CZ, x), s = Math.hypot(x, z - CZ) / Math.max(1e-6, rimR(th));
    let c = mix(shell[2], shell[1], smoothstep(0.2, 0.95, s) * 0.8);
    let h = 0.3;
    if (!hermit) {
      // H-shaped groove: two arcs bounding the cardiac region, the gastric groove across
      const ax = Math.abs(x) / W, zz = z / D;
      const arc = Math.abs(ax - (0.24 + 0.1 * zz * zz)) < 0.022 && zz > -0.65 && zz < 0.35;
      const cross = Math.abs(zz - 0.06 + ax * 0.12) < 0.03 && ax < 0.24;
      if (arc || cross) { c = shade(c, 0.78); h = 0; }
      // branchial swellings catch the light
      const bx = ax - 0.6, bz = zz + 0.15;
      if (bx * bx + bz * bz < 0.08) c = mix(c, shell[3], 0.25);
      // granules: neat rows of pale tubercles along the anterolateral margin and on the teeth
      // granules: one neat row of pale tubercles just inside the anterolateral margin, pale tooth tips
      const gj = Math.floor((th / TAU) * 72);
      if (Math.abs(s - 0.86) < 0.025 && z > CZ && (gj % 2 === 0)) { c = mix(c, C(pal.gran), 0.7); h = 1; }
      if (s > 0.96 && z > CZ - 0.1 * D) c = mix(c, C(pal.gran), 0.45);
    } else {
      // hermit shield: paler grooves and a few spots
      if (Math.abs(Math.abs(x) / W - 0.45) < 0.05 && z < 0.4 * D) c = shade(c, 0.8);
      if (pal.spots && ((Math.round(x / W * 3) + Math.round(z / D * 4)) & 1) === 0 && Math.hypot(x / W * 3 - Math.round(x / W * 3), z / D * 4 - Math.round(z / D * 4)) < 0.28) c = C(pal.spots);
    }
    // the rim is darker, the dome lit
    if (s > 0.98) c = shade(c, 0.75);
    return [c, 1, 0.42, h];
  });
  paintRect(pg, botR, (u, v) => {
    let c = mix(C(pal.belly), shade(C(pal.belly), 0.8), v);
    if (Math.abs(u - 0.5) < 0.03 || (Math.floor(v * 6) !== Math.floor((v + 0.03) * 6))) c = shade(c, 0.82);
    return [c, 1, 0.5, 0];
  });
  // limb paint: u around (0 top), v along (root -> tip)
  const legC = pal.leg.map(C) as RGB[];
  paintRect(pg, legR, (u, v, i, j) => {
    const top = Math.cos(u * TAU);
    let c = mix(legC[2], legC[0], 0.5 + 0.5 * top);
    // joints darker, a pale band near each joint
    if (v < 0.06 || v > 0.94) c = shade(c, 0.7);
    else if (v > 0.84) c = mix(c, C(pal.belly), 0.35);
    if (pal.spots && ((j >> 2) + (i >> 2)) % 3 === 0 && (j & 3) < 2 && (i & 3) < 2 && top > -0.3) c = (j & 3) === 0 || (i & 3) === 0 ? C(pal.ring ?? '#1a0c08') : C(pal.spots);
    if (hermit && top < -0.4 && (j % 3) === 0) c = shade(c, 0.55); // bristle fringe
    return [c, 1, 0.45, top > 0 ? 0.4 : 0];
  });
  paintRect(pg, clawR, (u, v, i, j) => {
    const top = Math.cos(u * TAU);
    let c = mix(shell[1], shell[3], 0.35 + 0.45 * top);
    if (top < -0.65) c = mix(c, C(pal.belly), 0.55);
    // tubercles on the upper palm: neat staggered rows
    if (top > 0.2 && ((i + ((j >> 2) & 1) * 2) % 4 === 0) && (j % 4 === 0)) c = C(pal.gran);
    if (pal.spots && ((i >> 2) + (j >> 2)) % 3 === 0 && (i & 3) < 2 && (j & 3) < 2) c = C(pal.spots);
    return [c, 1, 0.4, top > 0.2 ? 0.6 : 0.1];
  });
  paintRect(pg, fingR, (u, v, i) => {
    // finger: shell colour at the root, black from mid-way to the tip, white denticles along the inner edge
    const inner = Math.cos(u * TAU) < -0.5;
    let c = v < 0.35 ? mix(shell[2], C(pal.tip), smoothstep(0.15, 0.35, v)) : C(pal.tip);
    if (inner && v > 0.15 && v < 0.85 && (Math.floor(v * 16) % 2 === 0)) c = C('#f4ecd8');
    void i;
    return [c, 1, 0.3, 0];
  });
  paintEye(pg, eyeR, { iris: ['#050505', '#141210', '#2a2420', '#3a3430'], pupil: 0.2, sclera: pal.eye, irisR: 0.98, glint: true });
  paintRect(pg, stalkR, (u, v) => [mix(legC[0], legC[2], v), 1, 0.4, 0]);
  paintRect(pg, mouthR, (u, v) => {
    let c = mix(C(pal.belly), legC[1], 0.35);
    if (Math.abs(u - 0.5) < 0.05 || Math.abs(v - 0.45) < 0.05) c = shade(c, 0.7);
    return [c, 1, 0.5, 0];
  });
  // ------------------------------------------------------------------------------------------ carapace
  const NA = hermit ? 24 : 48;
  const tops = [0.3, 0.58, 0.8, 0.94, 1.0];
  const rings: { pts: V3[]; v: number }[] = [];
  for (const s of tops) { const pts: V3[] = []; for (let j = 0; j <= NA; j++) pts.push(shellPt((j / NA) * TAU, s)); rings.push({ pts, v: s }); }
  for (const [s, y] of [[0.97, Ht * 0.05], [0.8, -Ht * 0.3]] as [number, number][]) { const pts: V3[] = []; for (let j = 0; j <= NA; j++) pts.push(shellPt((j / NA) * TAU, s, y)); rings.push({ pts, v: 1 + s }); }
  const f0 = K.loftPart(rings, topR, { start: [0, domeY(0, CZ), CZ], end: [0, -Ht * 0.38, CZ] });
  const treg = pg.reg(topR), breg = pg.reg(botR), NP = NA + 1, nTop = tops.length;
  K.tag(f0.from, (i) => {
    if (i >= f0.to) return;
    const rel = i - f0.from, p = K.lo.pos(i);
    const top = rel < rings.length * NP ? Math.floor(rel / NP) < nTop : rel < rings.length * NP + NA;
    if (top) {
      K.lo.UV[i * 2] = treg.x + clamp((p[0] + XS) / (2 * XS), 0, 1) * treg.w;
      K.lo.UV[i * 2 + 1] = 1 - (treg.y + clamp((p[2] - ZS0) / (ZS1 - ZS0), 0, 1) * treg.h);
    } else {
      K.lo.UV[i * 2] = breg.x + clamp((p[0] + XS) / (2 * XS), 0, 1) * breg.w;
      K.lo.UV[i * 2 + 1] = 1 - (breg.y + clamp((p[2] - ZS0) / (ZS1 - ZS0), 0, 1) * breg.h);
    }
  });
  // ------------------------------------------------------------------------------------------ eyes, antennae, mouth plate
  const eyeBase = hermit ? 0.25 : 0.27;
  for (const s of [-1, 1]) {
    const base: V3 = [s * W * eyeBase, Ht * 0.55, D * (hermit ? 0.92 : 0.9)];
    const top: V3 = [s * W * (eyeBase + 0.04), Ht * (hermit ? 1.5 : 1.0), D * (hermit ? 1.1 : 1.02)];
    K.tube([base, [(base[0] + top[0]) / 2, (base[1] + top[1]) / 2 + 0.004, (base[2] + top[2]) / 2], top], (t) => (hermit ? 0.006 : 0.008) - t * 0.002, 6, stalkR, { capEnd: false });
    const er = hermit ? 0.009 : 0.011;
    const fe = K.lo.count;
    K.blob(top, [er, er * 1.1, er], eyeR, { seg: 10 });
    const ereg = pg.reg(eyeR);
    K.tag(fe, (i, A) => {
      const p = K.lo.pos(i);
      K.lo.UV[i * 2] = ereg.x + clamp(0.5 + (p[0] - top[0]) / (2 * er), 0, 1) * ereg.w;
      K.lo.UV[i * 2 + 1] = 1 - (ereg.y + clamp(0.5 - (p[1] - top[1]) / (2 * er * 1.1), 0, 1) * ereg.h);
      A.eye[i * 4] = top[0]; A.eye[i * 4 + 1] = top[1]; A.eye[i * 4 + 2] = top[2]; A.eye[i * 4 + 3] = 1;
    });
    // antennules / antennae: short pale feelers between the eyes
    K.cone([s * W * 0.08, Ht * 0.45, D * 0.98], [s * 0.3, 0.6, 1], hermit ? 0.07 : 0.035, 0.003, stalkR, 3, { flutter: 0.4, phase: s });
  }
  // third maxillipeds: the square plate covering the mouth, under the front edge
  K.blob([0, -Ht * 0.12, D * 0.86], [W * (hermit ? 0.35 : 0.2), Ht * 0.28, 0.014], mouthR, { seg: 8 });
  const body = K.geometry().geo;

  // ------------------------------------------------------------------------------------------ limbs
  const seg = (rect: typeof legR, len: number, r0: number, r1: number, flat: number, tip = false, bulge = 0, sides = 5, N = 3): LimbGeo => {
    const LK = new Kit(pg);
    const rr: { pts: V3[]; v: number }[] = [];
    for (let i = 0; i <= N; i++) {
      const f = i / N;
      const r = (r0 + (r1 - r0) * f) * (1 + bulge * Math.sin(f * Math.PI)) * (tip && f > 0.5 ? 1 - (f - 0.5) / 0.5 * 0.9 : 1);
      rr.push({ pts: Kit.ring([f * len, tip ? -f * f * len * 0.18 : 0, 0], [0, 0, 1], [0, 1, 0], r * flat, r, sides), v: f });
    }
    LK.loftPart(rr, rect, { start: [-r0 * 0.3, 0, 0], end: [len + (tip ? 0.003 : r1 * 0.3), tip ? -len * 0.2 : 0, 0] });
    return { geo: LK.geometry().geo, len };
  };
  const legLen = hermit ? [0.06, 0.05, 0.04] : [0.1, 0.085, 0.065];
  const lr = hermit ? 0.0085 : 0.012;
  const merus = seg(legR, legLen[0], lr, lr * 0.85, 0.55, false, 0.12);
  const carpus = seg(legR, legLen[1], lr * 0.85, lr * 0.62, 0.6, false, 0.08);
  const dactyl = seg(hermit ? legR : fingR, legLen[2], lr * 0.62, lr * 0.25, 0.7, true, 0, 4);
  const clawGeo = (k: number) => ({
    arm: seg(clawR, 0.075 * k, 0.016 * k, 0.019 * k, 0.75, false, 0.15, 5, 3),
    palm: seg(clawR, 0.075 * k, 0.024 * k, 0.026 * k, 0.6, false, 0.35, 6, 4),
    fixed: seg(fingR, 0.06 * k, 0.014 * k, 0.004, 0.55, true, 0, 4, 3),
    mov: seg(fingR, 0.062 * k, 0.013 * k, 0.004, 0.55, true, 0, 4, 3),
  });
  const claws = hermit ? [clawGeo(0.95), clawGeo(0.7)] : [clawGeo(1), clawGeo(1)];

  const parts = (m: FishModel) => {
    const mat = m.material;
    const mk = (g: LimbGeo, flipY = false) => { const ms = new THREE.Mesh(g.geo, mat); ms.castShadow = true; ms.customDepthMaterial = m.asset.depthMat; if (flipY) ms.scale.y = -1; return ms; };
    const legs: THREE.Object3D[][] = [];
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      if (hermit && k > 2) continue;
      const root = new THREE.Object3D();
      // legs leave the carapace's posterolateral edge, splayed fore and aft
      const zk = hermit ? 0.35 - k * 0.45 : 0.32 - k * 0.3;
      root.position.set(s * W * (hermit ? 0.9 : 0.86 - Math.max(0, k - 1) * 0.08), -Ht * 0.12, D * zk);
      root.rotation.y = s > 0 ? -(k - 1.4) * 0.32 : Math.PI + (k - 1.4) * 0.32;
      const a = new THREE.Object3D(), b = new THREE.Object3D(), c = new THREE.Object3D();
      a.add(mk(merus)); b.position.x = merus.len; b.add(mk(carpus)); c.position.x = carpus.len; c.add(mk(dactyl));
      a.add(b); b.add(c); root.add(a);
      a.rotation.z = 0.55; b.rotation.z = -1.05; c.rotation.z = -0.55;
      m.group.add(root);
      legs.push([root, a, b, c]);
    }
    const clawL: THREE.Object3D[][] = [];
    for (const s of [-1, 1]) {
      const g = claws[s < 0 ? 0 : 1];
      const root = new THREE.Object3D();
      root.position.set(s * W * (hermit ? 0.45 : 0.58), -Ht * 0.05, D * 0.72);
      root.rotation.y = s > 0 ? -0.95 : Math.PI + 0.95;
      const ar = new THREE.Object3D(); ar.add(mk(g.arm));
      const pv = new THREE.Object3D(); pv.position.x = g.arm.len; pv.add(mk(g.palm));
      const fix = new THREE.Object3D(); fix.position.set(g.palm.len, -0.004, 0); fix.add(mk(g.fixed)); fix.rotation.z = -0.12;
      const mov = new THREE.Object3D(); mov.position.set(g.palm.len * 0.92, 0.01 * (hermit ? 0.8 : 1), 0); mov.add(mk(g.mov, true)); mov.rotation.z = 0.3;
      pv.add(fix, mov);
      ar.add(pv); root.add(ar);
      ar.rotation.z = 0.2; pv.rotation.y = s > 0 ? -1.2 : 1.2; pv.rotation.z = -0.05;
      m.group.add(root);
      clawL.push([root, ar, pv, mov]);
    }
    (m.parts as Record<string, unknown>).legs = legs as unknown as THREE.Object3D;
    m.anim.walk = 0; m.anim.pinch = 0; m.anim.raise = 0; m.anim.walkPhase = m.seed;
    (m as unknown as { crab: unknown }).crab = { legs, claws: clawL };
  };
  const nPerSide = hermit ? 3 : 4;
  const animate = (m: FishModel, dt: number) => {
    const cr = (m as unknown as { crab: { legs: THREE.Object3D[][]; claws: THREE.Object3D[][] } }).crab;
    if (!cr) return;
    const w = m.anim.walk ?? 0;
    m.anim.walkPhase = (m.anim.walkPhase ?? 0) + dt * (1.6 + Math.abs(w) * 14);
    const ph = m.anim.walkPhase;
    const amp = Math.min(1, Math.abs(w) * 3);
    cr.legs.forEach(([, a, b, c], i) => {
      const k = i % nPerSide, s = i < nPerSide ? -1 : 1;
      // alternating tetrapod gait: neighbours and opposite legs out of phase
      const p = ph + k * Math.PI + (s > 0 ? Math.PI * 0.5 : 0);
      const lift = Math.max(0, Math.sin(p));
      a.rotation.z = 0.55 + lift * 0.42 * amp + Math.sin(ph * 0.31 + i) * 0.025;
      a.rotation.y = Math.cos(p) * 0.28 * amp;
      b.rotation.z = -1.05 - lift * 0.3 * amp;
      c.rotation.z = -0.55 + Math.sin(p) * 0.16 * amp;
    });
    const pinch = m.anim.pinch ?? 0, raise = m.anim.raise ?? 0;
    cr.claws.forEach(([, ar, pv, mov], i) => {
      ar.rotation.z = 0.2 + raise * 1.0 + Math.sin(ph * 0.5 + i * 2) * 0.035;
      pv.rotation.z = -0.05 + raise * 0.6;
      // idle: the fingers work a little (picking food); pinch snaps them shut
      mov.rotation.z = 0.32 - pinch * 0.34 + Math.max(0, Math.sin(ph * 0.4 + i * 3)) * 0.12 * (1 - pinch);
    });
  };
  return kitAsset(name, body, pg, {
    length: W * 2.6, mouth: [0, 0, D * 1.1], eye: [W * eyeBase, Ht * 1.1, D * 1.02], eyeR: 0.011,
    amp: 0, freq: 1, parts, animate, clearcoat: 0.3, clearcoatRough: 0.4, palette: 18,
    anchors: { clawL: [-W * 1.4, Ht, D * 1.4], clawR: [W * 1.4, Ht, D * 1.4] },
    uwo: { rim: 0.25, sss: [0.9, 0.8, 0.75], sssK: 0.45 },
  });
}

export const crab = () => crabBase('crab', {
  shell: ['#3e0a10', '#6a1612', '#9a2c1a', '#d0582e'], belly: '#f0c8a0', leg: ['#d4583a', '#b0402a', '#7a2618'], tip: '#120a08', gran: '#f4b48a', eye: '#1a1414',
});
