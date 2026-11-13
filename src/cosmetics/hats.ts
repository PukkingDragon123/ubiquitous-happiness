// Cosmetic hats for the blobfish v2 (registered into gear.ts HAT_EXT): coral crown, pirate tricorn, viking helm,
// chef toque, party cone, jellyfish cap, anglerfish lure headlamp, samurai kabuto. PS2-style: a few dozen faceted
// polys each over small clean pixel pages (deliberate shapes, no noise). Rigid hats sit in a 'hatTilt' group on the
// head anchor (the title screen tilts it on hover); cloth / tentacles are gear ribbons that stream in the current.
import * as THREE from 'three';
import { Loft, type V3 } from '../gfx/loft';
import { ctex, T, tone, rect, stitches, gemFacets, type Tones } from '../skills/texkit';
import { hash2, TAU } from '../core/math';
import { psxMat, facet, xf } from '../player/psx';
import { HAT_EXT, shellGeo, type HatBuild, type HatId } from '../player/gear';

// ------------------------------------------------------------------ geometry helpers
/** a revolved surface: profile [radius, y] from the rim up; u = angle * rep, v = along the profile (row 0 = rim) */
export function lathe(profile: [number, number][], sides: number, o: { rep?: number; a0?: number; a1?: number; warp?: (p: THREE.Vector3, j: number, i: number) => void; flip?: boolean } = {}) {
  const rep = o.rep ?? 1, a0 = o.a0 ?? 0, a1 = o.a1 ?? TAU;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const n = profile.length;
  // arc length along the profile for v
  const L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) for (let j = 0; j <= sides; j++) {
    const a = a0 + (a1 - a0) * (j / sides);
    v.set(Math.cos(a) * profile[i][0], profile[i][1], -Math.sin(a) * profile[i][0]);
    o.warp?.(v, j, i);
    pos.push(v.x, v.y, v.z);
    uv.push((j / sides) * rep, 1 - (L[i] / (L[n - 1] || 1)) * 0.995);
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + 1, c = a + sides + 2, d = a + sides + 1;
    if (o.flip) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return facet(g);
}
export function tubeGeo(path: V3[], r: (t: number) => number, sides: number, caps = true) {
  const L = new Loft(); L.tube(path, r, sides, { x: 0, y: 0, w: 1, h: 1 }, 0, { capStart: caps, capEnd: caps }); return facet(L.build());
}
/** a flat tapered blade / leaf strip along a path, width(t), lying in the plane spanned by the path and `side` */
export function stripGeo(path: V3[], w: (t: number) => number, side: V3) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  path.forEach((p, i) => {
    const t = i / (path.length - 1), ww = w(t);
    pos.push(p[0] - side[0] * ww, p[1] - side[1] * ww, p[2] - side[2] * ww, p[0] + side[0] * ww, p[1] + side[1] * ww, p[2] + side[2] * ww);
    uv.push(0, 1 - t, 1, 1 - t);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return facet(g);
}
const ico = (r: number, at: V3, sc: V3 = [1, 1, 1]) => facet(xf(new THREE.IcosahedronGeometry(r, 0), at, [0, 0, 0], sc));
/** the hat's own group on the head anchor: sits on the dome, tipped a touch forward */
function seat(h: HatBuild, x = -0.1, y = 0.0, tilt = -0.06, scale = 1.3) {
  const g = new THREE.Group(); g.name = 'hatTilt';
  g.position.set(x, y, 0); g.rotation.z = tilt; g.scale.setScalar(scale);
  h.rig.add(g);
  return g;
}
const R4: [number, number, number, number] = [0, 0, 1, 1];

// ------------------------------------------------------------------ pages
const CORAL = (ts: Tones, key: string) => ctex(key, 32, 32, (p) => {
  for (let y = 0; y < 32; y++) rect(p, 0, y, 32, 1, tone(ts, y < 6 ? 4 : y < 16 ? 3 : 2));
  // polyp cups in offset rows: a dark pit with a lit rim
  for (let y = 2; y < 32; y += 5) for (let x = (y % 2) * 3 + 1; x < 32; x += 6) {
    p.set(x, y, tone(ts, 0)); p.set(x + 1, y, tone(ts, 1)); p.set(x, y - 1, tone(ts, 4)); p.set(x + 1, y + 1, tone(ts, 1));
  }
});
const RUBBLE = () => ctex('coralRubble', 32, 16, (p) => {
  const C = ['#4a1a1e', '#7a3438', '#a85a52', '#d08a74', '#f0c0a0'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    const k = (Math.floor(x / 5) + Math.floor(y / 4) * 2) % 3;
    p.set(x, y, tone(C, k === 0 ? 2 : k === 1 ? 3 : 1));
  }
  for (let x = 2; x < 32; x += 5) for (let y = 1; y < 16; y += 4) { p.set(x, y, tone(T.bone, 4)); p.set(x + 1, y, tone(T.bone, 3)); }
});
const FELT = () => ctex('tricornFelt', 64, 16, (p) => {
  const F = ['#120e16', '#221c2a', '#342a3e', '#4a3e56', '#64567a'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) p.set(x, y, tone(F, y < 2 ? 3 : (x + y) % 9 === 0 ? 1 : 2));
  // gold braid on the brim edge
  for (let y = 11; y < 16; y++) for (let x = 0; x < 64; x++) p.set(x, y, tone(T.gold, y === 11 || y === 15 ? 1 : (x + y) % 4 < 2 ? 4 : 3));
});
const SKULL = () => ctex('skullBadge', 16, 16, (p) => {
  const W = '#f4ecd8', S = '#a89a80', K = '#100c08';
  // crossbones
  for (let i = 0; i < 12; i++) { p.set(2 + i, 3 + i, W); p.set(13 - i, 3 + i, W); p.set(2 + i, 4 + i, S); p.set(13 - i, 4 + i, S); }
  for (const [x, y] of [[1, 2], [2, 2], [14, 2], [13, 2], [1, 15], [2, 15], [14, 15], [13, 15]]) p.set(x, y, W);
  p.ellipse(7.5, 6.5, 4.5, 4.2, W);
  rect(p, 5, 10, 6, 2, W); rect(p, 5, 11, 6, 1, S);
  p.ellipse(5.8, 6.6, 1.3, 1.4, K); p.ellipse(9.2, 6.6, 1.3, 1.4, K); p.set(7, 9, K); p.set(8, 9, K);
  for (const x of [6, 8, 10]) p.set(x, 11, K);
  p.outline('#000000', 255);
});
const FEATHER = () => ctex('feather', 16, 32, (p) => {
  for (let y = 0; y < 32; y++) {
    const w = Math.round(Math.sin((y / 31) * Math.PI) * 7 + 1);
    for (let x = 8 - w; x < 8 + w; x++) p.set(x, y, tone(T.red, (x + y) % 3 === 0 ? 2 : x < 8 ? 3 : 4));
    p.set(7, y, '#f0e0c8'); p.set(8, y, '#c8b090');
  }
});
const STEEL_DOME = () => ctex('vikingDome', 64, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) { const k = x % 16; p.set(x, y, tone(T.steel, k < 2 ? 3 : k < 9 ? 2 : k < 14 ? 1 : 2)); }
  // bronze spangen bands + rim band, riveted
  const BR = T.brass;
  for (const bx of [0, 16, 32, 48]) { rect(p, bx + 6, 0, 4, 32, tone(BR, 2)); rect(p, bx + 6, 0, 1, 32, tone(BR, 4)); rect(p, bx + 9, 0, 1, 32, tone(BR, 0)); for (let y = 4; y < 26; y += 6) { p.set(bx + 7, y, tone(BR, 4)); p.set(bx + 8, y + 1, tone(BR, 1)); } }
  rect(p, 0, 26, 64, 6, tone(BR, 2)); rect(p, 0, 26, 64, 1, tone(BR, 4)); rect(p, 0, 31, 64, 1, tone(BR, 0));
  for (let x = 2; x < 64; x += 5) { p.set(x, 28, tone(BR, 4)); p.set(x + 1, 29, tone(BR, 1)); }
  // a dent or two
  for (const [x, y] of [[22, 12], [41, 7]]) { p.set(x, y, tone(T.steel, 0)); p.set(x + 1, y, tone(T.steel, 4)); }
});
const HORN = () => ctex('vikingHorn', 16, 32, (p) => {
  const H = ['#3a2a18', '#6a5236', '#a08a62', '#d4c49a', '#f4ead0'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) {
    // dark tip (row 0) -> creamy -> dark ringed base (row 31)
    let k = y < 4 ? 1 : y < 9 ? 2 : y < 24 ? 3 : 2;
    if (x % 8 < 2) k = Math.min(4, k + 1);
    if (y > 9 && y % 4 === 0) k = Math.max(0, k - 1);
    p.set(x, y, tone(H, k));
  }
  rect(p, 0, 28, 16, 4, tone(T.brass, 2)); rect(p, 0, 28, 16, 1, tone(T.brass, 4));
});
const TOQUE = () => ctex('toque', 64, 64, (p) => {
  const W = ['#7a8088', '#a8aeb6', '#ccd2d8', '#e6eaee', '#f8fafc'];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const j = Math.floor(x / (64 / 14)), sx = x % (64 / 14);
    let k = j % 2 ? 2 : 3;
    if (sx < 1) k = 4;
    if (y > 48) k = 3;                                  // the band
    if (y < 14) k = 3 + ((x + y) % 11 === 0 ? -1 : 0);  // the puffed crown
    p.set(x, y, tone(W, k));
  }
  rect(p, 0, 48, 64, 1, tone(W, 1)); rect(p, 0, 49, 64, 1, tone(W, 4));
  for (let x = 0; x < 64; x += 3) p.set(x, 56, tone(W, 1));
  rect(p, 0, 14, 64, 1, tone(W, 1));
});
const PARTY = () => ctex('partyCone', 32, 64, (p) => {
  const C = [['#a01a5a', '#e0408a', '#ff8ac0'], ['#b07a08', '#f0c020', '#fff08a'], ['#0a6a7a', '#20b8c8', '#8af0f0']];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    const b = Math.floor((x + y * 0.7) / 6) % 3, e = (x + y * 0.7) % 6;
    p.set(x, y, C[b][e < 1 ? 0 : e < 5 ? 1 : 2]);
  }
  for (let y = 4; y < 60; y += 8) for (let x = (y % 16 ? 4 : 0); x < 32; x += 8) { p.set(x, y, '#ffffff'); p.set(x + 1, y, '#ffffff'); p.set(x, y + 1, '#e8e8f0'); }
  rect(p, 0, 58, 32, 6, tone(T.gold, 3)); rect(p, 0, 58, 32, 1, tone(T.gold, 4)); rect(p, 0, 63, 32, 1, tone(T.gold, 1));
});
const JELLY = () => ctex('jellyBell', 64, 32, (p) => {
  const J = ['#5a1a6a', '#8a3a9a', '#c070d0', '#e8a8f0', '#fce0ff'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) p.set(x, y, tone(J, y > 28 ? 3 : y > 20 ? 2 : 2));
  // radial canals
  for (let x = 0; x < 64; x += 4) for (let y = 4; y < 29; y++) p.set(x, y, tone(J, 3));
  // four horseshoe gonads near the apex (row 31 is the top)
  for (let k = 0; k < 4; k++) { const cx = 8 + k * 16; for (let a = 0; a < 12; a++) { const t = (a / 11) * Math.PI; p.set(Math.round(cx + Math.cos(t) * 5), Math.round(24 - Math.sin(t) * 4), tone(J, 4)); p.set(Math.round(cx + Math.cos(t) * 4), Math.round(24 - Math.sin(t) * 3), '#ff9ad8'); } }
  // rim with rhopalia dots
  rect(p, 0, 0, 64, 2, tone(J, 4)); for (let x = 2; x < 64; x += 8) p.set(x, 2, '#ffffff');
});
const JELLY_TENT = () => ctex('jellyTent', 16, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x + y) % 4 < 2 ? '#f8c8ff' : '#c880e0'); });
const STALK = () => ctex('lureStalk', 16, 32, (p) => {
  const S = ['#2a1a1e', '#4a3036', '#7a5a5e', '#a88a88', '#d0b8b0'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(S, y % 5 === 0 ? 1 : x % 8 < 3 ? 3 : 2));
});
const GLOW = () => ctex('lureGlow', 16, 16, (p) => gemFacets(p, 0, 0, 16, 16, ['#2a8aa0', '#6ad8e8', '#b8fcff', '#e8ffff', '#ffffff']));
const LACQUER = () => ctex('kabutoBowl', 64, 32, (p) => {
  const L = ['#06060c', '#0e1020', '#1a1e36', '#28304e', '#3c4870'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) { const k = x % 8; p.set(x, y, tone(L, k === 0 ? 4 : k < 3 ? 3 : k < 6 ? 2 : 1)); }
  // rivet lines on each ridge, a gold band at the rim
  for (let x = 0; x < 64; x += 8) for (let y = 3; y < 25; y += 4) p.set(x + 1, y, tone(T.gold, 4));
  rect(p, 0, 26, 64, 6, tone(T.gold, 2)); rect(p, 0, 26, 64, 1, tone(T.gold, 4)); rect(p, 0, 31, 64, 1, tone(T.gold, 0));
  for (let x = 3; x < 64; x += 8) { p.set(x, 28, tone(T.gold, 4)); p.set(x + 1, 29, tone(T.gold, 1)); }
});
const SHIKORO = () => ctex('kabutoShikoro', 64, 16, (p) => {
  const L = ['#06060c', '#0e1020', '#1a1e36', '#28304e', '#3c4870'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) p.set(x, y, tone(L, x % 4 === 0 ? 1 : y < 2 ? 4 : 2));
  // vermilion silk lacing (odoshi): vertical cords crossing each plate row
  for (let x = 2; x < 64; x += 4) for (let y = 2; y < 14; y++) { p.set(x, y, tone(T.red, y % 3 === 0 ? 2 : 4)); }
  rect(p, 0, 14, 64, 2, tone(T.gold, 3)); rect(p, 0, 15, 64, 1, tone(T.gold, 1));
});
const GOLD_PLATE = () => ctex('kabutoGold', 16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, tone(T.gold, x < 2 ? 4 : x > 13 ? 1 : y % 8 === 0 ? 2 : 3)); });
const SUN = () => ctex('kabutoSun', 16, 16, (p) => { p.ellipse(7.5, 7.5, 7.5, 7.5, tone(T.gold, 3)); p.ellipse(7.5, 7.5, 6, 6, tone(T.gold, 1)); p.ellipse(7.5, 7.5, 5, 5, '#c8141c'); p.ellipse(6.5, 6.5, 2, 2, '#f04a3a'); });
const STRAP = () => ctex('lampStrap', 32, 16, (p) => { rect(p, 0, 0, 32, 16, tone(T.leather, 2)); rect(p, 0, 0, 32, 2, tone(T.leather, 4)); rect(p, 0, 14, 32, 2, tone(T.leather, 0)); stitches(p, 0, 3, 31, 3); stitches(p, 0, 12, 31, 12); });

// ------------------------------------------------------------------ the hats
const M = (map: THREE.Texture | null, o: Parameters<typeof psxMat>[1] = {}) => psxMat(map, o);

const BUILD: Partial<Record<HatId, (h: HatBuild) => void>> = {
  coralCrown(h) {
    const g = seat(h, -0.1, -0.02, -0.04, 1.4);
    h.add(lathe([[0.27, 0], [0.295, 0.03], [0.285, 0.07], [0.25, 0.085]], 10, { rep: 2, warp: (v, j) => { v.multiplyScalar(1 + (j % 2 ? 0.05 : -0.02)); } }), M(RUBBLE(), { rough: 0.9 }), false, g);
    const mats = [M(CORAL(T.coral, 'coralOrange'), { rough: 0.85, sss: [1, 0.5, 0.4], sssK: 0.3 }), M(CORAL(T.pink, 'coralPink'), { rough: 0.85, sss: [1, 0.5, 0.6], sssK: 0.3 })];
    const tipM = M(null, { color: '#ffe0c0', rough: 0.6, emissive: '#ff9a7a', emissiveK: 0.15 });
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU + 0.22, ca = Math.cos(a), sa = -Math.sin(a);
      const front = Math.max(0, Math.cos(a));
      const hgt = 0.2 + front * 0.16 + hash2(k, 1, 9) * 0.05;
      const base: V3 = [ca * 0.25, 0.06, sa * 0.25];
      const path: V3[] = [];
      for (let i = 0; i <= 4; i++) { const t = i / 4; path.push([base[0] + ca * t * 0.07 + Math.sin(t * 5 + k) * 0.012, base[1] + t * hgt, base[2] + sa * t * 0.07]); }
      h.add(tubeGeo(path, (t) => 0.042 * (1 - t * 0.5), 5), mats[k % 2], false, g);
      const tip = path[4];
      h.add(ico(0.028, [tip[0], tip[1] + 0.01, tip[2]]), tipM, false, g);
      // a fork off the middle
      const m0 = path[2], side = k % 2 ? 1 : -1;
      const fk: V3[] = [m0, [m0[0] - sa * side * 0.05 + ca * 0.03, m0[1] + hgt * 0.22, m0[2] + ca * side * 0.05 + sa * 0.03], [m0[0] - sa * side * 0.07 + ca * 0.05, m0[1] + hgt * 0.42, m0[2] + ca * side * 0.07 + sa * 0.05]];
      h.add(tubeGeo(fk, (t) => 0.022 * (1 - t * 0.5), 4), mats[k % 2], false, g);
      h.add(ico(0.02, fk[2]), tipM, false, g);
    }
  },
  tricorn(h) {
    const g = seat(h, -0.1, 0.0, -0.08, 1.45);
    const felt = M(FELT(), { rough: 0.95, side: THREE.DoubleSide });
    h.add(lathe([[0.235, 0], [0.25, 0.08], [0.24, 0.17], [0.17, 0.23], [0.0, 0.245]], 12, { rep: 2 }), M(FELT(), { rough: 0.95 }), false, g);
    // the brim, cocked up on three sides into a triangle with its points front and back-left / back-right
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const NA = 24, F = [0.22, 0.32, 1];
    for (let i = 0; i < F.length; i++) for (let j = 0; j <= NA; j++) {
      const a = (j / NA) * TAU, s = Math.abs(Math.sin(1.5 * a));
      const R = 0.42 + 0.16 * Math.pow(1 - s, 2.2);
      const r = i < 2 ? F[i] : R, f = i === 0 ? 0 : i === 1 ? 0.25 : 1;
      const y = 0.012 + Math.pow(f, 1.4) * 0.22 * Math.pow(s, 0.75);
      pos.push(Math.cos(a) * r, y, -Math.sin(a) * r);
      uv.push((j / NA) * 4, 1 - (i === 2 ? 0.995 : i * 0.35));
    }
    for (let i = 0; i < F.length - 1; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 2, d = a + NA + 1; idx.push(a, b, c, a, c, d); }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx);
    h.add(facet(bg), felt, false, g);
    // skull and crossbones on the front point, a red plume tucked into the side
    const badge = new THREE.PlaneGeometry(0.11, 0.11); badge.rotateY(Math.PI / 2);
    const b = h.add(badge, M(SKULL(), { rough: 0.7, alphaTest: 0.5, side: THREE.DoubleSide }), false, g);
    b.position.set(0.255, 0.1, 0); b.rotation.z = -0.12;
    h.add(stripGeo([[-0.05, 0.12, 0.22], [-0.12, 0.2, 0.25], [-0.22, 0.27, 0.24], [-0.33, 0.29, 0.2], [-0.42, 0.26, 0.15]], (t) => 0.035 * Math.sin(Math.min(1, t * 1.2 + 0.1) * Math.PI) + 0.006, [0, 0.55, 0.83]), M(FEATHER(), { rough: 0.9, side: THREE.DoubleSide }), false, g);
  },
  viking(h) {
    const g = seat(h, -0.1, -0.02, -0.05);
    h.add(lathe([[0.275, 0], [0.275, 0.05], [0.25, 0.15], [0.18, 0.235], [0.09, 0.275], [0.0, 0.285]], 10), M(STEEL_DOME(), { metal: 0.85, rough: 0.35 }), false, g);
    // nose guard
    h.add(facet(xf(new THREE.BoxGeometry(0.035, 0.15, 0.06), [0.272, -0.04, 0], [0, 0, 0.12])), M(STEEL_DOME(), { metal: 0.8, rough: 0.35 }), false, g);
    const hm = M(HORN(), { rough: 0.55 });
    for (const s of [-1, 1]) {
      const path: V3[] = [[0.0, 0.1, s * 0.23], [0.02, 0.16, s * 0.35], [0.01, 0.27, s * 0.45], [-0.03, 0.39, s * 0.47], [-0.06, 0.47, s * 0.42]];
      h.add(tubeGeo(path, (t) => 0.06 * Math.pow(1 - t, 0.8) + 0.006, 6), hm, false, g);
    }
  },
  toque(h) {
    const g = seat(h, -0.1, -0.01, 0.08);
    // band, pleated column, puffed crown: alternate sides pushed in / out so every pleat is its own facet
    h.add(lathe([[0.215, 0], [0.22, 0.085], [0.235, 0.1], [0.265, 0.3], [0.3, 0.345], [0.315, 0.4], [0.28, 0.46], [0.16, 0.505], [0, 0.515]], 14, {
      warp: (v, j, i) => { if (i >= 2 && i <= 6) { const k = 1 + (j % 2 ? -0.045 : 0.035); v.x *= k; v.z *= k; } if (i >= 5) v.y += Math.sin(j * 1.7) * 0.012; },
    }), M(TOQUE(), { rough: 0.95, sss: [1, 1, 1], sssK: 0.25 }), false, g);
  },
  partyCone(h) {
    const g = seat(h, -0.04, 0.0, 0.22, 1.45);
    g.rotation.x = -0.22;
    h.add(lathe([[0.165, 0], [0.125, 0.15], [0.075, 0.3], [0.0, 0.45]], 8), M(PARTY(), { rough: 0.6 }), false, g);
    const cols = ['#ffffff', '#ff8ac0', '#ffe060', '#8af0f0', '#ffffff', '#ff8ac0', '#ffe060'];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU, r = k === 0 ? 0 : 0.03;
      h.add(ico(0.03, [Math.cos(a) * r, 0.47 + (k === 0 ? 0.02 : (k % 2) * 0.012), Math.sin(a) * r]), M(null, { color: cols[k], metal: 0.3, rough: 0.3, emissive: cols[k], emissiveK: 0.12 }), false, g);
    }
  },
  jellyCap(h) {
    const g = seat(h, -0.1, -0.03, -0.05, 1.35);
    const bell = M(JELLY(), { rough: 0.3, side: THREE.DoubleSide, emissive: '#ff7ad8', emissiveK: 0.35, sss: [1, 0.6, 1], sssK: 0.6 });
    bell.transparent = true; bell.opacity = 0.78; bell.depthWrite = false;
    h.add(lathe([[0.31, 0], [0.325, 0.035], [0.29, 0.12], [0.22, 0.2], [0.11, 0.255], [0, 0.27]], 16, {
      warp: (v, j, i) => { if (i < 2) { const a = (j / 16) * TAU; const k = 1 + Math.cos(a * 8) * 0.07; v.x *= k; v.z *= k; v.y += Math.cos(a * 8) * 0.018; } },
    }), bell, false, g).renderOrder = 7;
    // tentacles from the rim and two frilly oral arms from under the bell
    const tm = M(JELLY_TENT(), { rough: 0.4, side: THREE.DoubleSide, emissive: '#ff9ae8', emissiveK: 0.5 });
    tm.transparent = true; tm.opacity = 0.75;
    const ribs: NonNullable<HatBuild['part']['ribbons']> = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.3;
      const o = new THREE.Object3D(); o.position.set(Math.cos(a) * 0.3, 0.0, -Math.sin(a) * 0.3); g.add(o);
      ribs.push({ mat: tm, opts: { n: 8, seg: 0.055, w0: 0.012, w1: 0.006, gravity: 0.0009, flutter: 0.003, uv: R4, thick: 0.004 }, anchor: o, k: k / 6 });
    }
    for (const s of [-1, 1]) { const o = new THREE.Object3D(); o.position.set(-0.05, -0.02, s * 0.08); g.add(o); ribs.push({ mat: tm, opts: { n: 6, seg: 0.05, w0: 0.04, w1: 0.02, gravity: 0.0008, flutter: 0.004, uv: R4, thick: 0.004 }, anchor: o, k: s > 0 ? 0.9 : 0.1 }); }
    h.part.ribbons = ribs;
  },
  anglerLamp(h) {
    // a leather strap round the head (skin-tight), a brass mount, the lure stalk arching over the face, the lamp
    h.add(shellGeo(0.73, 0.785, 0, 1, () => 0.024, undefined, { closed: true, uvScale: [5, 1] }), M(STRAP(), { rough: 0.75 }), true);
    const g = seat(h, 0.0, 0.0, 0.0, 1.15);
    const brass = M(ctex('lampBrass', 16, 16, (p) => gemFacets(p, 0, 0, 16, 16, T.brass)), { metal: 0.8, rough: 0.35 });
    h.add(facet(xf(new THREE.BoxGeometry(0.1, 0.03, 0.12), [0.1, -0.035, 0], [0, 0, -0.55])), brass, false, g);
    const path: V3[] = [[0.1, -0.02, 0], [0.14, 0.12, 0], [0.24, 0.25, 0], [0.4, 0.31, 0], [0.54, 0.27, 0], [0.62, 0.18, 0]];
    h.add(tubeGeo(path, (t) => 0.024 * (1 - t * 0.5), 6), M(STALK(), { rough: 0.6, sss: [1, 0.6, 0.6], sssK: 0.4 }), false, g);
    const cage = new THREE.TorusGeometry(0.062, 0.012, 4, 8); cage.rotateX(Math.PI / 2);
    h.add(facet(xf(cage, [0.63, 0.15, 0])), brass, false, g);
    const bulb = h.add(ico(0.055, [0.63, 0.12, 0], [1, 1.15, 1]), M(GLOW(), { emissive: '#aef6ff', emissiveK: 2.2, rough: 0.15 }), false, g);
    bulb.name = 'lureGlow';
    const fm = M(null, { color: '#bff8ff', emissive: '#7ae8ff', emissiveK: 1.2, side: THREE.DoubleSide });
    h.part.ribbons = [-1, 1].map((s) => { const o = new THREE.Object3D(); o.position.set(0.63, 0.07, s * 0.02); g.add(o); return { mat: fm, opts: { n: 5, seg: 0.035, w0: 0.008, w1: 0.004, gravity: 0.0012, flutter: 0.003, uv: R4, thick: 0.003 }, anchor: o, k: s > 0 ? 0.7 : 0.3 }; });
  },
  kabuto(h) {
    const g = seat(h, -0.1, -0.02, -0.04, 1.35);
    h.add(lathe([[0.265, 0], [0.275, 0.06], [0.25, 0.15], [0.19, 0.225], [0.1, 0.27], [0.0, 0.28]], 12, { rep: 1.5 }), M(LACQUER(), { rough: 0.35, metal: 0.2 }), false, g);
    const gold = M(GOLD_PLATE(), { metal: 0.85, rough: 0.3 });
    // the visor over the face
    h.add(lathe([[0.27, 0.01], [0.37, -0.04]], 6, { a0: -1.05, a1: 1.05, flip: true }), M(LACQUER(), { rough: 0.35, side: THREE.DoubleSide }), false, g);
    // the neck guard: three flared lamellar bands, open at the front
    const sh = M(SHIKORO(), { rough: 0.5, side: THREE.DoubleSide });
    for (let k = 0; k < 3; k++) {
      const r0 = 0.28 + k * 0.04, r1 = 0.33 + k * 0.045, y0 = 0.02 - k * 0.065;
      h.add(lathe([[r0, y0], [r1, y0 - 0.075]], 10, { a0: 0.95 + k * 0.05, a1: TAU - 0.95 - k * 0.05, rep: 3 }), sh, false, g);
    }
    // turned-back side wings and the golden crest: two horn blades and a red sun disc
    for (const s of [-1, 1]) {
      const w = h.add(facet(new THREE.BoxGeometry(0.11, 0.085, 0.014)), M(SHIKORO(), { rough: 0.5 }), false, g);
      w.position.set(0.17, 0.0, s * 0.31); w.rotation.set(0, s * -0.9, 0.15);
      h.add(stripGeo([[0.27, 0.06, s * 0.035], [0.3, 0.17, s * 0.09], [0.31, 0.29, s * 0.15], [0.29, 0.39, s * 0.2]], (t) => 0.03 * (1 - t * 0.7), [1, 0, 0]), M(GOLD_PLATE(), { metal: 0.9, rough: 0.25, side: THREE.DoubleSide }), false, g);
    }
    const disc = new THREE.CylinderGeometry(0.055, 0.055, 0.014, 10); disc.rotateZ(Math.PI / 2);
    const d = h.add(facet(disc), M(SUN(), { metal: 0.5, rough: 0.35 }), false, g);
    d.position.set(0.3, 0.1, 0);
    h.add(facet(xf(new THREE.TorusGeometry(0.03, 0.01, 4, 8), [0, 0.29, 0], [Math.PI / 2, 0, 0])), gold, false, g);
  },
};
for (const [id, fn] of Object.entries(BUILD)) HAT_EXT[id as HatId] = fn;
export const COSMETIC_HAT_IDS = Object.keys(BUILD) as HatId[];
