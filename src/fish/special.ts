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
import { FishModel, SpeciesAsset } from './model';
import { kitAsset, paintRect } from './kitutil';
import { seaTurtle } from './turtle';
import { jellyfish } from './jelly';
import { crab, crabBase } from './crab';
import { stingrayHoneycomb, stingrayBlue } from './ray';
import { hash2, vnoise, clamp } from '../core/math';
import { worley, RGB } from '../gfx/px';
import { smoothstep } from './curve';

const TAU = Math.PI * 2;
const v3 = (p: V3) => new THREE.Vector3(p[0], p[1], p[2]);

// ============================================================================================ hermit crab
// Friendly hermit crab facing +x inside a spiral voxel-ridged shell, with big snipping claws (cuts fishing lines).
function hermit(): SpeciesAsset {
  const base = crabBase('hermit_body', { shell: ['#5a0e0a', '#9a2214', '#c8401e', '#ec7a44'], belly: '#f6d8b8', leg: ['#e0482a', '#b8301c', '#7a1a10'], tip: '#2a1008', gran: '#ffe0c8', eye: '#101010', spots: '#fff4e8', ring: '#1a0806' }, true);
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
  jellyfish, crab, hermit, sea_turtle: seaTurtle, stingray: stingrayHoneycomb, stingray_blue: stingrayBlue,
  sea_cucumber: seaCucumber, starfish,
};
