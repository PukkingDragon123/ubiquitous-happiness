// MR. CRAB and his shop: the showcase for the PS2-realistic look. Low-poly, but every part carries a dense
// hand-painted page (128-256 px): flat deliberate tone ramps, granules placed one by one, painted wear, grooves,
// stitching and wet glints. No noise speckle, no dither.
//
// MR. CRAB (a Dungeness / red-king-crab hybrid, ~2.5k tris): a wide carapace with real form (frontal teeth between
// the eyes, anterolateral spines along the front edges, raised gastric / cardiac / branchial regions, a granular
// surface, a healed scar and a few barnacles), stalked eyes in sockets with glossy compound-eye beads, antennules and
// antennae, layered maxillipeds that work when he talks, an asymmetric crusher (molar teeth) and cutter claw with
// knobbed, bristled merus / carpus / propodus and dark hard tips, four pairs of jointed walking legs with pointed
// dactyls (idle shifting, a tetrapod scuttle), a worn leather vendor apron with stitched pockets and tools, a brass
// monocle on a chain and a briar pipe that puffs bubbles.
//
// THE SHOP: a half-buried old ship's cabin turned stall: weathered planks with nails, rust bleeding and stains,
// rusted sheet-metal patches, rope lashings, a porthole, a tattered canvas awning flapping in the current, barnacles,
// sponges and kelp growing on it; a weapon wall (toothpicks, a fork trident, nail daggers, a fishhook scythe, a
// pencil spear) each with a price tag; glass jars of oddities, a brass scale, a ledger, a shell bell, a lantern and a
// bioluminescent jar that cast real light (Lighting.lamp) plus a cool rim light; the hand-painted sign
// "MR. CRAB'S — ARMS & ODDITIES".
//
//   const crab = new MrCrab(); scene.add(crab.group); crab.update(dt);  crab.talk = 1 (while speaking), crab.move (m/s)
//   const shop = new CrabShop(); scene.add(shop.group); shop.setLighting(rig); shop.update(dt)
import * as THREE from 'three';
import { Px, hex, type RGB } from '../gfx/px';
import { psxMat } from '../player/psx';
import { ctex, T, tone, rect, bevel, stitches } from '../skills/texkit';
import { drawText } from '../ui/pixel/font';
import { TAU, clamp, damp, hash2, smooth } from '../core/math';
import { worley } from '../gfx/px';
import type { LampHandle } from '../gfx/lighting';

// ------------------------------------------------------------------ shared helpers
type Ramp = RGB[];
const ramp = (cs: string[]): Ramp => cs.map((c) => hex(c));
const at = (r: Ramp, i: number): RGB => r[Math.max(0, Math.min(r.length - 1, Math.round(i)))];
/** a crisp painted page (nearest, cached) */
const page = (key: string, w: number, h: number, fn: (p: Px) => void) => ctex('crab.' + key, w, h, fn);
const mat = (map: THREE.Texture | null, o: { rough?: number; metal?: number; color?: string; emissive?: string; emissiveK?: number; side?: THREE.Side; alphaTest?: number; flat?: boolean } = {}) =>
  psxMat(map, { rough: o.rough ?? 0.7, metal: o.metal, color: o.color, emissive: o.emissive, emissiveK: o.emissiveK, side: o.side, alphaTest: o.alphaTest, flat: o.flat ?? true });
/** flat-shade a geometry (every facet its own normal) */
function facet(g: THREE.BufferGeometry) { const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals(); return n; }
function mk(g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], shadow = true) {
  const me = new THREE.Mesh(facet(g), m);
  me.castShadow = shadow; me.receiveShadow = true;
  return me;
}

/** the red-orange-brown shell ramp (dark -> light) and the cream underside */
const SHELL = ramp(['#240a05', '#3e1309', '#5c1d0d', '#7c2a12', '#9a3a18', '#b44d20', '#c8632c', '#d87e3e', '#e69c58', '#f2bf82']);
const CREAM = ramp(['#5a3e30', '#86644e', '#b08e72', '#d0b290', '#e6d0b0', '#f4e6cc', '#fcf4e4']);
const TIP = ramp(['#0e0806', '#1e120c', '#33201a', '#4e3428', '#6e5040']);

/**
 * a tube along +x from 0 to len with an elliptical cross-section: profile(t) -> [ry, rz]. u runs round the tube from
 * the top (u = 0 top, 0.5 bottom), v along it. Cheap and explicit, so pages can paint "top" and "underside".
 */
function tube(len: number, prof: (t: number) => [number, number], rings: number[], sides = 6, bend = 0): THREE.BufferGeometry {
  const P: number[] = [], U: number[] = [], I: number[] = [];
  const n = sides;
  for (const t of rings) {
    const [ry, rz] = prof(t);
    const x = t * len, yb = Math.sin(t * Math.PI) * bend * len;
    for (let j = 0; j <= n; j++) {
      const a = (j / n) * TAU;
      P.push(x, yb + Math.cos(a) * ry, Math.sin(a) * rz);
      U.push(j / n, t);
    }
  }
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1;
    I.push(a, c, b, b, c, d);
  }
  // caps (fan to the end points)
  const cap = (ri: number, end: number, flip: boolean) => {
    const t = rings[ri];
    const ci = P.length / 3;
    P.push(t * len + end, Math.sin(t * Math.PI) * bend * len, 0); U.push(0.5, t);
    for (let j = 0; j < n; j++) { const a = ri * (n + 1) + j; if (flip) I.push(ci, a, a + 1); else I.push(ci, a + 1, a); }
  };
  cap(0, 0, true); cap(rings.length - 1, 0, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

/** a granule: a 2x2 bump with a lit top-left, a shadowed bottom-right */
function granule(p: Px, x: number, y: number, r: Ramp, base: number, big = false) {
  p.set(x, y, at(r, base + 2)); p.set(x + 1, y, at(r, base + 1)); p.set(x, y + 1, at(r, base + 1)); p.set(x + 1, y + 1, at(r, base));
  p.set(x + 2, y + 1, at(r, base - 2)); p.set(x + 1, y + 2, at(r, base - 2)); p.set(x + 2, y + 2, at(r, base - 2));
  if (big) { p.set(x - 1, y, at(r, base + 1)); p.set(x, y - 1, at(r, base + 1)); p.set(x + 3, y + 2, at(r, base - 2)); }
}

// ================================================================== MR. CRAB
// carapace outline: angle th (0 = his right (+x), pi/2 = front (+z)) -> radius; the widest part sits a little behind
// the middle, the front edge is flattened and set with teeth.
const CW = 0.66, CL = 0.46, CH = 0.2, CZ = -0.04;
function rimR(th: number) {
  const c = Math.cos(th), s = Math.sin(th);
  let r = 1 / Math.sqrt((c * c) / (CW * CW) + (s * s) / (CL * CL));
  r *= 1 - 0.14 * smooth(0.55, 1, s);              // a straighter front edge
  r *= 1 - 0.1 * smooth(-0.4, -1, s);              // the narrower rear
  return r;
}
/** normalised radius (0 centre .. 1 rim) of a top-view point */
function rhoOf(x: number, z: number) { const dz = z - CZ; const th = Math.atan2(dz, x); return Math.hypot(x, dz) / rimR(th); }
const bump = (x: number, z: number, cx: number, cz: number, r: number) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
/** carapace height above the rim plane */
function shellY(x: number, z: number) {
  const rho = Math.min(1, rhoOf(x, z));
  let y = CH * Math.pow(Math.max(0, 1 - Math.pow(rho, 3.2)), 0.42);
  y += 0.05 * bump(x, z, 0, 0.13, 0.15);           // gastric
  y += 0.035 * bump(x, z, 0, -0.17, 0.11);         // cardiac
  y += 0.05 * (bump(x, z, 0.32, -0.05, 0.16) + bump(x, z, -0.32, -0.05, 0.16)); // branchial
  y -= 0.03 * smooth(0.25, 0.42, z) * (1 - Math.min(1, Math.abs(x) / 0.25));     // the frontal dip between the eyes
  y -= 0.018 * Math.exp(-((Math.hypot(x, z - 0.1) - 0.2) ** 2) / 0.0012) * smooth(-0.1, 0.1, z - 0.02); // cervical groove
  return y * (rho > 0.97 ? 1 - (rho - 0.97) * 10 : 1);
}

const SHELL_PAGE = () => page('shell', 256, 256, (p) => {
  const S = 256, span = 1.6;
  const toW = (px: number, py: number): [number, number] => [((px + 0.5) / S - 0.5) * span, (0.5 - (py + 0.5) / S) * span];
  // base tones: dome-lit, mottled in big deliberate patches, lighter worn edges, dark rim line
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const [x, z] = toW(px, py);
    const rho = rhoOf(x, z);
    if (rho > 1.0) {
      // outside the outline: the spines' colour (orange, darkening to the hard tips)
      p.set(px, py, at(SHELL, 7 - Math.min(5, (rho - 1) * 40)));
      continue;
    }
    let t = 3.3 + rho * 2.4;
    const [f1, , id] = worley(px, py, 26, 9, 0);
    if (id < 0.34 && f1 < 9 + id * 10) t -= 1;                 // darker mottled patches
    else if (id > 0.82 && f1 < 7) t += 0.6;
    t += shellY(x, z) * 4;                                      // the regions catch more light
    // cervical groove + region boundaries: dark line, lit lip on the uphill side
    const gr = Math.abs(Math.hypot(x, z - 0.1) - 0.2);
    if (gr < 0.006 && z > 0.0) t = 2;
    else if (gr < 0.013 && z > 0.0 && Math.hypot(x, z - 0.1) < 0.2) t += 1.2;
    const midGroove = Math.abs(x) < 0.006 && z < -0.02 && z > -0.3;
    if (midGroove) t = 2.6;
    if (rho > 0.88) t += 1.3 * smooth(0.88, 0.96, rho);       // worn lighter edge
    if (rho > 0.975) t = 3;                                     // rim shadow line
    p.set(px, py, at(SHELL, t));
  }
  // granules, placed one by one on a jittered grid; clusters of darker ones in the mottled cells
  for (let gy = 2; gy < S - 2; gy += 5) for (let gx = 2; gx < S - 2; gx += 5) {
    const jx = gx + Math.floor(hash2(gx, gy, 3) * 4) - 1, jy = gy + Math.floor(hash2(gx, gy, 4) * 4) - 1;
    const [x, z] = toW(jx, jy);
    const rho = rhoOf(x, z);
    if (rho > 0.95 || hash2(gx, gy, 5) < 0.18) continue;
    const [, , id] = worley(jx, jy, 26, 9, 0);
    const dark = id < 0.34 || hash2(gx, gy, 6) < 0.12;
    const base = 3.6 + rho * 2.4 + shellY(x, z) * 4 + (dark ? -1.6 : 0);
    granule(p, jx, jy, SHELL, base, rho < 0.5 && hash2(gx, gy, 7) < 0.25);
  }
  // the scar: a healed crack across his right branchial region (pale ridge, dark edge, a few cross cracks)
  const scar: [number, number][] = [[0.16, 0.08], [0.24, 0.02], [0.31, -0.03], [0.4, -0.11], [0.47, -0.2]];
  const pix = (x: number, z: number): [number, number] => [Math.round((x / span + 0.5) * S - 0.5), Math.round((0.5 - z / span) * S - 0.5)];
  for (let i = 0; i < scar.length - 1; i++) {
    const [ax, ay] = pix(...scar[i]), [bx, by] = pix(...scar[i + 1]);
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
      p.set(x, y, '#f0c8a8'); p.set(x, y - 1, '#e2ae8a'); p.set(x + 1, y + 1, at(SHELL, 1)); p.set(x, y + 1, at(SHELL, 2));
      if (k % 6 === 3) { p.set(x - 1, y - 2, at(SHELL, 2)); p.set(x + 2, y + 2, at(SHELL, 2)); p.set(x + 1, y - 1, '#f0c8a8'); }
    }
  }
  // barnacle footprints (the cones sit on them)
  for (const [x, z] of BARNACLES) { const [bx, by] = pix(x, z); p.ellipse(bx + 0.5, by + 0.5, 4.5, 4, '#c8c0b0'); p.ellipse(bx + 0.5, by + 0.5, 3, 2.6, '#8a8478'); }
  // wet glints, sparingly, on the tops of the regions
  for (const [x, z, l] of [[0, 0.16, 4], [-0.3, 0.0, 3], [0.33, 0.02, 3], [0.02, -0.15, 2], [-0.14, 0.24, 2]] as [number, number, number][]) {
    const [gx, gy] = pix(x, z);
    for (let k = 0; k < l; k++) p.set(gx + k, gy - k, k === 0 ? '#ffffff' : '#ffe6cc');
    p.set(gx + 1, gy, '#ffd8b4');
  }
});
const BARNACLES: [number, number][] = [[-0.36, -0.2], [-0.27, -0.27], [-0.42, -0.1], [0.08, -0.32]];

const BELLY_PAGE = () => page('belly', 128, 128, (p) => {
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = (x - 64) / 64, dy = (y - 64) / 64;
    let t = 4.6 - Math.hypot(dx, dy) * 1.4;
    // sternum plates: horizontal sutures + the folded abdomen (a pointed flap down the middle)
    if (y % 18 === 0) t = 2.4; else if (y % 18 === 1) t += 0.8;
    if (Math.abs(dx) < 0.32 - (dy + 1) * 0.11 && dy > -0.3) t += Math.abs(dx) > 0.28 - (dy + 1) * 0.11 ? -1.6 : 0.5;
    p.set(x, y, at(CREAM, t));
  }
});

/** walking-leg segment page: red-orange on top, cream beneath, dark joint membrane, knobs + bristles */
const LEG_PAGE = (tipK: number) => page('leg' + tipK, 64, 128, (p) => {
  for (let py = 0; py < 128; py++) for (let px = 0; px < 64; px++) {
    const u = (px + 0.5) / 64, v = 1 - (py + 0.5) / 128;
    const up = Math.cos(u * TAU);
    let col: RGB;
    if (up < -0.2) col = at(CREAM, 3.4 + up * -0.8);
    else {
      let t = 4.6 + up * 1.8;
      if (v > 0.86 && v < 0.94 && up > 0.3) t += 1.4;                 // worn knuckle
      if (tipK > 0 && v > 0.55) { col = at(TIP, (1 - (v - 0.55) / 0.45) * 4 + (up > 0.6 ? 0.6 : 0)); p.set(px, py, col); continue; }
      col = at(SHELL, t);
    }
    if (v < 0.06 || v > 0.95) col = up < -0.2 ? at(CREAM, 1.5) : ([88, 34, 40] as RGB);   // joint membrane
    p.set(px, py, col);
  }
  // knobs along the top ridge
  for (let py = 10; py < 116; py += 11) for (const px of [3, 59]) granule(p, px - 1, py, SHELL, 6);
  // bristles (setae): short dark hairs combed toward the tip along both lower edges
  for (let py = 6; py < 122; py += 4) for (const px of [20, 43]) { p.set(px, py, '#2a1a12'); p.set(px + (px < 32 ? -1 : 1), py - 1, '#3e2a1c'); p.set(px + (px < 32 ? -1 : 1) * 2, py - 2, '#5a4030'); }
  // a broken highlight streak along the top
  for (let py = 30; py < 70; py++) if (py % 9 < 6) p.set(1, py, '#ffd2a8');
  if (tipK > 0) for (let px = 26; px < 38; px++) p.set(px, 1, '#a08060');     // a worn horn tip
});

/** claw page: granular top, cream-white underside, molar / tooth ridge, dark tips toward v = 1 when tipK */
const CLAW_PAGE = (tipK: number) => page('claw' + tipK, 128, 128, (p) => {
  for (let py = 0; py < 128; py++) for (let px = 0; px < 128; px++) {
    const u = (px + 0.5) / 128, v = 1 - (py + 0.5) / 128;
    const up = Math.cos(u * TAU);
    let c: RGB;
    if (up < -0.15) c = at(CREAM, 4 + Math.min(1.5, -up));
    else c = at(SHELL, 4.8 + up * 1.6 + (v > 0.4 && v < 0.6 ? 0.4 : 0));
    if (tipK > 0 && v > 0.62) c = at(TIP, Math.max(0, (1 - (v - 0.62) / 0.38) * 4.2) + (up > 0.5 ? 0.5 : 0));
    p.set(px, py, c);
  }
  // dense granules over the top half, sparser near the underside
  for (let gy = 3; gy < 124; gy += 6) for (let gx = 2; gx < 126; gx += 6) {
    const jx = gx + Math.floor(hash2(gx, gy, 31) * 3), jy = gy + Math.floor(hash2(gx, gy, 32) * 3);
    const up = Math.cos(((jx + 0.5) / 128) * TAU), v = 1 - (jy + 0.5) / 128;
    if (up < -0.1 || (tipK > 0 && v > 0.6) || hash2(gx, gy, 33) < 0.2) continue;
    granule(p, jx, jy, SHELL, 5 + up * 1.2 + (hash2(gx, gy, 34) < 0.2 ? -1.6 : 0), hash2(gx, gy, 35) < 0.15);
  }
  // setae tufts along the lower edges
  for (let py = 8; py < 100; py += 5) for (const px of [34, 94]) { p.set(px, py, '#2a1a12'); p.set(px, py + 1, '#46301e'); p.set(px + 1, py + 2, '#5a4030'); }
  // wet glints
  for (const [x, y] of [[8, 40], [120, 60], [10, 88]]) { p.set(x, y, '#ffffff'); p.set(x + 1, y - 1, '#ffe6cc'); p.set(x + 2, y - 2, '#ffd8b4'); }
});

const EYE_PAGE = () => page('eye', 32, 32, (p) => {
  // a compound eye: near-black with a hex grid of facets and a tight specular cluster
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const hx = (x + (Math.floor(y / 3) % 2) * 1.5) % 3, hy = y % 3;
    p.set(x, y, hx < 1 || hy === 0 ? '#120c10' : y < 14 ? '#3a2830' : '#2a1c22');
  }
  rect(p, 8, 6, 3, 2, '#ffffff'); rect(p, 7, 8, 2, 1, '#e8e0ff');
});
const STALK_PAGE = () => page('stalk', 32, 64, (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) { const up = Math.cos(((x + 0.5) / 32) * TAU); p.set(x, y, at(SHELL, 5 + up * 1.4 + (y < 6 ? 1.4 : 0))); }
  for (let y = 8; y < 60; y += 7) granule(p, 2, y, SHELL, 6);
});
const MXP_PAGE = () => page('mxp', 32, 32, (p) => {
  // a maxilliped plate: cream-orange, a darker margin, a fringe of setae along the bottom edge
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const edge = x < 2 || x > 29 || y < 2;
    p.set(x, y, edge ? at(SHELL, 4) : y > 26 ? '#2e1e16' : at(SHELL, 6.5 - y / 14));
  }
  for (let x = 1; x < 31; x += 2) { p.set(x, 29, '#4a3424'); p.set(x, 30, '#6a5040'); p.set(x + 1, 31, '#4a3424'); }
  for (let y = 6; y < 24; y += 6) { p.set(10, y, at(SHELL, 8)); p.set(20, y + 3, at(SHELL, 8)); }
});

const LEATHER = ramp(['#1a0c06', '#2e170b', '#452412', '#5c331b', '#744426', '#8c5732', '#a46e44', '#bc875a']);
const APRON_PAGE = () => page('apron', 128, 128, (p) => {
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    let t = 3.6 + Math.sin(x * 0.07 + Math.sin(y * 0.05) * 1.5) * 0.4;
    const [f1, , id] = worley(x, y, 30, 41, 0);
    if (id < 0.3 && f1 < 11) t -= 1;                                  // dark stains (oil, ink)
    const edge = Math.min(x, y, 127 - x, 127 - y);
    if (edge < 4) t += 1.6 - edge * 0.25;                            // worn, lighter edges
    p.set(x, y, at(LEATHER, t));
  }
  // creases: curved dark lines with a lit lip
  for (const [x0, y0, len, a] of [[20, 30, 30, 0.3], [70, 22, 26, -0.2], [30, 96, 40, 0.1], [88, 80, 24, 0.6], [10, 64, 20, -0.4]] as [number, number, number, number][]) {
    for (let k = 0; k < len; k++) {
      const x = Math.round(x0 + Math.cos(a) * k), y = Math.round(y0 + Math.sin(a) * k + Math.sin(k * 0.2) * 2);
      p.set(x, y, at(LEATHER, 1)); p.set(x, y - 1, at(LEATHER, 5));
    }
  }
  // stitched border
  stitches(p, 5, 5, 122, 5, '#d8c090', '#2a1408'); stitches(p, 5, 122, 122, 122, '#d8c090', '#2a1408');
  stitches(p, 5, 5, 5, 122, '#d8c090', '#2a1408'); stitches(p, 122, 5, 122, 122, '#d8c090', '#2a1408');
  // two pockets with stitched rims and a darker inside lip
  for (const [px, py, pw, ph] of [[14, 62, 44, 40], [70, 62, 44, 40]]) {
    bevel(p, px, py, pw, ph, ['#1a0c06', '#2e170b', '#452412', '#5c331b', '#744426'], 3);
    rect(p, px + 1, py + 1, pw - 2, 3, at(LEATHER, 1));
    stitches(p, px + 2, py + 5, px + pw - 3, py + 5, '#d8c090', '#2a1408');
    stitches(p, px + 2, py + 5, px + 2, py + ph - 3, '#d8c090', '#2a1408');
    stitches(p, px + pw - 3, py + 5, px + pw - 3, py + ph - 3, '#d8c090', '#2a1408');
    stitches(p, px + 2, py + ph - 3, px + pw - 3, py + ph - 3, '#d8c090', '#2a1408');
  }
  // brass rivets at the pocket corners
  for (const [x, y] of [[15, 63], [55, 63], [71, 63], [111, 63]]) { p.set(x, y, '#f8dc8a'); p.set(x + 1, y, '#d8a03a'); p.set(x, y + 1, '#a86c1c'); p.set(x + 1, y + 1, '#6e4210'); }
  // a chalked tally on the bib
  for (let k = 0; k < 4; k++) rect(p, 50 + k * 4, 26, 1, 9, '#c8bca0');
  for (let k = 0; k < 15; k++) p.set(48 + k, 34 - Math.round(k * 0.5), '#c8bca0');
});
const BARNACLE_PAGE = () => page('barnacle', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const plate = Math.floor(((x + 0.5) / 32) * 6);
    const k = (x % 5.33) / 5.33;
    p.set(x, y, y > 26 ? '#d8d0c0' : k < 0.2 ? '#7a746a' : plate % 2 ? (y < 8 ? '#e8e2d4' : '#b8b0a2') : (y < 8 ? '#d4ccbe' : '#a49c8e'));
  }
  for (let x = 0; x < 32; x += 3) { p.set(x, 12, '#8a8478'); p.set(x + 1, 20, '#8a8478'); }
});
const BRIAR_PAGE = () => page('briar', 32, 32, (p) => {
  const R = ramp(['#1a0a06', '#2e140a', '#4a2212', '#6a341c', '#8a4a2a']);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, at(R, 2.4 + Math.sin(y * 0.6 + Math.sin(x * 0.4) * 2) * 0.9));
  for (let x = 0; x < 32; x += 7) { p.set(x, 4, '#a8683a'); p.set(x + 1, 4, '#c88a52'); }
});
const BRASS = () => ctex('crab.brass', 32, 32, (p) => { bevel(p, 0, 0, 32, 32, T.brass, 3); for (let x = 2; x < 30; x += 6) p.set(x, 15, tone(T.brass, 4)); rect(p, 3, 3, 4, 1, '#fff6d0'); });

export class MrCrab {
  group = new THREE.Group();
  /** the body that bobs, leans and breathes; legs are planted under it */
  body = new THREE.Group();
  talk = 0;
  /** sideways speed (m/s) for the scuttle */
  move = 0;
  /** looks toward (world x) */
  lookX: number | null = null;
  facing = 1;
  /** pipe puff callback (bubble particles): world point */
  onPuff?: (p: THREE.Vector3) => void;
  private t = Math.random() * 10;
  private legs: { hip: THREE.Group; knee: THREE.Group; ankle: THREE.Group; toe: THREE.Group; side: number; i: number; lift: number; liftT: number }[] = [];
  private claws: { root: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; finger: THREE.Group; big: boolean }[] = [];
  private eyes: THREE.Group[] = [];
  private antennae: THREE.Group[][] = [];
  private antennules: THREE.Group[] = [];
  private mxp: THREE.Group[] = [];
  private mxpInner: THREE.Group[] = [];
  private pipeBowl = new THREE.Object3D();
  private snipT = 0;
  private puffT = 1;
  private blinkT = 3; private blink = 0;
  private tmp = new THREE.Vector3();

  constructor() {
    const g = this.group, B = this.body;
    g.add(B);
    B.position.y = 0.5;
    const shellM = mat(SHELL_PAGE(), { rough: 0.5 });
    // ---- carapace: a radial grid (centre -> rim), top-view planar UVs onto the 256 px page
    const NA = 44, rings = [0, 0.16, 0.32, 0.48, 0.62, 0.74, 0.84, 0.92, 0.97, 1];
    const P: number[] = [], UV: number[] = [], I: number[] = [];
    const uvOf = (x: number, z: number) => { UV.push(x / 1.6 + 0.5, z / 1.6 + 0.5); };
    for (const rho of rings) for (let j = 0; j <= NA; j++) {
      const th = (j / NA) * TAU, r = rimR(th) * rho;
      const x = Math.cos(th) * r, z = CZ + Math.sin(th) * r;
      P.push(x, shellY(x, z), z); uvOf(x, z);
    }
    // the rim folds under (still the shell page, its outer band)
    for (const [k, dy] of [[1.02, -0.05], [0.97, -0.11]] as [number, number][]) for (let j = 0; j <= NA; j++) {
      const th = (j / NA) * TAU, r = rimR(th) * k;
      const x = Math.cos(th) * r, z = CZ + Math.sin(th) * r;
      P.push(x, dy, z); uvOf(x * 1.02, z * 1.02);
    }
    const nr = rings.length + 2;
    for (let i = 0; i < nr - 1; i++) for (let j = 0; j < NA; j++) {
      const a = i * (NA + 1) + j, b = a + 1, c = a + NA + 1, d = c + 1;
      I.push(a, b, c, b, d, c);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    cg.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    cg.setIndex(I);
    B.add(mk(cg, shellM));
    // ---- the underside (cream sternum + abdomen flap)
    const belly = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.55, 0.42, 0.12, 14).scale(1, 1, 0.66)), mat(BELLY_PAGE(), { rough: 0.65 }));
    belly.position.set(0, -0.15, CZ); belly.castShadow = true;
    B.add(belly);
    // ---- spines: frontal teeth between the eyes, 9 anterolateral teeth down each front edge
    const spineGeo = new THREE.ConeGeometry(0.03, 0.075, 4);
    spineGeo.rotateZ(-Math.PI / 2);
    const spineAt = (th: number, size: number) => {
      const r = rimR(th);
      const x = Math.cos(th) * r, z = CZ + Math.sin(th) * r;
      const sp = new THREE.Mesh(facet(spineGeo.clone()), shellM);
      sp.position.set(x, 0.005, z);
      sp.rotation.set(0, -th + (Math.cos(th) > 0 ? 0.35 : -0.35) * Math.abs(Math.sin(th)), 0.12);
      sp.scale.setScalar(size);
      sp.castShadow = true;
      B.add(sp);
    };
    for (let k = 0; k < 9; k++) { const a = 0.22 + k * 0.12; spineAt(a, 1.1 - k * 0.05); spineAt(Math.PI - a, 1.1 - k * 0.05); }
    for (const a of [Math.PI / 2 - 0.09, Math.PI / 2, Math.PI / 2 + 0.09]) spineAt(a, a === Math.PI / 2 ? 0.95 : 0.75);
    // ---- barnacles (open-topped plated cones) on his back-left shoulder
    const bm = mat(BARNACLE_PAGE(), { rough: 0.8 }), dark = mat(null, { color: '#1a1410', rough: 0.9 });
    for (const [i, [x, z]] of BARNACLES.entries()) {
      const s = i === 0 ? 1 : 0.7;
      const cone = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.018 * s, 0.035 * s, 0.035 * s, 6, 1, true)), bm);
      cone.position.set(x, shellY(x, z) + 0.012, z); cone.castShadow = true;
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.017 * s, 6), dark);
      hole.rotation.x = -Math.PI / 2; hole.position.set(x, shellY(x, z) + 0.029 * s + 0.012, z);
      B.add(cone, hole);
    }
    // ---- eyes on stalks in their sockets, with antennules between and antennae below
    const stalkM = mat(STALK_PAGE(), { rough: 0.55 }), eyeM = new THREE.MeshStandardMaterial({ map: EYE_PAGE(), roughness: 0.12, metalness: 0.15, flatShading: true });
    const socketM = mat(null, { color: '#2a0c06', rough: 0.9 });
    const glintM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    for (const s of [-1, 1]) {
      const sock = new THREE.Mesh(facet(new THREE.TorusGeometry(0.05, 0.022, 4, 8)), socketM);
      const fz = CZ + rimR(Math.PI / 2 - s * 0.2) * Math.sin(Math.PI / 2 - s * 0.2) - 0.035;
      sock.position.set(s * 0.12, shellY(s * 0.12, fz) - 0.01, fz); sock.rotation.x = -1.2;
      B.add(sock);
      const e = new THREE.Group();
      e.position.copy(sock.position);
      const stalk = new THREE.Mesh(facet(tube(0.19, (t) => [0.03 - t * 0.008, 0.03 - t * 0.008], [0, 0.5, 1], 6).rotateZ(Math.PI / 2)), stalkM);
      stalk.castShadow = true;
      const bead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.045, 1), eyeM);
      bead.position.y = 0.21; bead.rotation.y = -0.6; bead.scale.set(1, 1.15, 1); bead.castShadow = true;
      const gl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.008, 0), glintM);
      gl.position.set(-0.016, 0.235, 0.035);
      e.add(stalk, bead, gl);
      e.rotation.set(-0.1, 0, -s * 0.22);
      B.add(e);
      this.eyes.push(e);
      // antennule: a small folded feather between the eyes
      const au = new THREE.Group();
      au.position.set(s * 0.04, shellY(0, fz) - 0.03, fz + 0.03);
      const a1 = new THREE.Mesh(facet(tube(0.07, () => [0.008, 0.008], [0, 1], 4)), stalkM);
      a1.rotation.z = 1.2;
      const a2 = new THREE.Mesh(facet(tube(0.06, (t) => [0.007 * (1 - t) + 0.002, 0.007 * (1 - t) + 0.002], [0, 1], 4)), mat(null, { color: '#5a2a1a' }));
      a2.position.set(0.024, 0.065, 0); a2.rotation.z = 2.4;
      au.add(a1, a2);
      au.scale.x = s;
      B.add(au);
      this.antennules.push(au);
      // antenna: a long whip in three jointed pieces
      const chain: THREE.Group[] = [];
      let parent: THREE.Object3D = B;
      for (let k = 0; k < 3; k++) {
        const j = new THREE.Group();
        if (k === 0) { j.position.set(s * 0.2, -0.01, fz + 0.01); j.rotation.set(0, -s * 0.9, 0.35); }
        else j.position.x = 0.13;
        const seg = new THREE.Mesh(facet(tube(0.13, (t) => [0.009 - k * 0.002 - t * 0.002, 0.009 - k * 0.002 - t * 0.002], [0, 1], 4)), mat(null, { color: k ? '#7a3a1e' : '#9a4a22', rough: 0.6 }));
        j.add(seg);
        parent.add(j);
        parent = j;
        chain.push(j);
      }
      if (s < 0) for (const j of chain) j.scale.x = 1; // mirrored by the root yaw
      this.antennae.push(chain);
    }
    // ---- maxillipeds: two outer "doors" over the mouth and two little inner ones that flutter
    const mxpM = mat(MXP_PAGE(), { rough: 0.6, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(s * 0.085, -0.04, CZ + CL * 0.86);
      const plate = new THREE.Mesh(facet(new THREE.BoxGeometry(0.085, 0.13, 0.014)), mxpM);
      plate.position.set(-s * 0.042, -0.06, 0); plate.castShadow = true;
      hinge.add(plate);
      hinge.rotation.x = 0.25;
      B.add(hinge);
      this.mxp.push(hinge);
      const inner = new THREE.Group();
      inner.position.set(s * 0.03, -0.05, CZ + CL * 0.84);
      const ip = new THREE.Mesh(facet(new THREE.BoxGeometry(0.035, 0.08, 0.01)), mxpM);
      ip.position.y = -0.04;
      inner.add(ip);
      B.add(inner);
      this.mxpInner.push(inner);
    }
    // ---- claws: merus -> carpus -> propodus (palm + fixed finger) -> dactyl (movable finger)
    const clawM = mat(CLAW_PAGE(0), { rough: 0.45 }), fingerM = mat(CLAW_PAGE(1), { rough: 0.35 }), knobM = mat(LEG_PAGE(0), { rough: 0.5 });
    const buildClaw = (side: number, k: number, big: boolean) => {
      const root = new THREE.Group();
      root.position.set(side * 0.3, -0.07, CZ + 0.32);
      // merus: from under the shell, out and forward
      const merus = new THREE.Mesh(facet(tube(0.3 * k + 0.08, (t) => [0.06 * k + 0.012 - t * 0.008, 0.045 * k + 0.012], [0, 0.2, 0.8, 1], 6)), clawM);
      merus.castShadow = true;
      root.add(merus);
      for (let q = 0; q < 3; q++) { const kn = new THREE.Mesh(facet(new THREE.ConeGeometry(0.014 * k + 0.004, 0.035 * k + 0.01, 4)), knobM); kn.position.set((0.1 + q * 0.08) * k + 0.03, 0.055 * k + 0.012, 0); kn.castShadow = true; root.add(kn); }
      root.rotation.set(0, side > 0 ? -0.55 : -Math.PI + 0.55, side > 0 ? -0.12 : 0.12);
      const elbow = new THREE.Group();
      elbow.position.x = 0.3 * k + 0.08;
      root.add(elbow);
      const carpus = new THREE.Mesh(facet(tube(0.17 * k + 0.04, (t) => [0.065 * k + 0.012 + Math.sin(t * Math.PI) * 0.015, 0.05 * k + 0.012], [0, 0.3, 0.7, 1], 6)), clawM);
      carpus.castShadow = true;
      elbow.add(carpus);
      const spine = new THREE.Mesh(facet(new THREE.ConeGeometry(0.02 * k + 0.004, 0.07 * k + 0.012, 4)), fingerM);
      spine.position.set(0.09 * k, 0.07 * k + 0.012, 0.02); spine.rotation.z = -0.5;
      elbow.add(spine);
      elbow.rotation.set(0, side > 0 ? -1.15 : 1.15, 0.2);
      const wrist = new THREE.Group();
      wrist.position.x = 0.17 * k + 0.04;
      elbow.add(wrist);
      // propodus: a swollen palm, tall and laterally flat
      const palmL = 0.34 * k;
      const palm = new THREE.Mesh(facet(tube(palmL, (t) => [0.06 * k + Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.09 * k * (big ? 1.1 : 0.8), 0.045 * k + Math.sin(Math.min(1, t * 1.25) * Math.PI) * 0.04 * k], [0, 0.2, 0.45, 0.7, 0.88, 1], 7)), clawM);
      palm.castShadow = true;
      wrist.add(palm);
      // the fixed finger (pollex) from the palm's lower front, teeth on its upper edge
      const pol = new THREE.Mesh(facet(tube(0.26 * k, (t) => [0.04 * k * (1 - t * 0.85) + 0.004, 0.032 * k * (1 - t * 0.8) + 0.004], [0, 0.35, 0.7, 1], 5, 0.06)), fingerM);
      pol.position.set(palmL * 0.95, -0.035 * k, 0); pol.castShadow = true;
      wrist.add(pol);
      const toothGeo = big ? new THREE.DodecahedronGeometry(0.016 * k, 0) : new THREE.ConeGeometry(0.008, 0.02, 4);
      const toothM = mat(null, { color: big ? '#f0dcc0' : '#e8d0b0', rough: 0.4 });
      for (let q = 0; q < (big ? 4 : 6); q++) {
        const th = new THREE.Mesh(facet(toothGeo.clone()), toothM);
        th.position.set(palmL * 0.95 + (0.03 + q * (big ? 0.045 : 0.03)) * k, -0.035 * k + 0.035 * k * (1 - q * 0.15), 0);
        wrist.add(th);
      }
      // the movable finger (dactyl), hinged at the palm's upper front, curving down to the pollex tip
      const finger = new THREE.Group();
      finger.position.set(palmL * 0.92, 0.06 * k, 0);
      const dac = new THREE.Mesh(facet(tube(0.27 * k, (t) => [0.038 * k * (1 - t * 0.85) + 0.004, 0.03 * k * (1 - t * 0.8) + 0.004], [0, 0.35, 0.7, 1], 5, -0.07)), fingerM);
      dac.castShadow = true;
      finger.add(dac);
      for (let q = 0; q < (big ? 3 : 5); q++) {
        const th = new THREE.Mesh(facet(toothGeo.clone()), toothM);
        th.position.set((0.04 + q * (big ? 0.05 : 0.035)) * k, -0.03 * k, 0);
        th.rotation.z = Math.PI;
        finger.add(th);
      }
      wrist.add(finger);
      wrist.rotation.set(0, side > 0 ? -0.75 : 0.75, -0.2);
      B.add(root);
      this.claws.push({ root, elbow, wrist, finger, big });
    };
    buildClaw(1, 1.3, true);     // the crusher, his right
    buildClaw(-1, 0.86, false);  // the cutter
    // ---- four pairs of walking legs: coxa stub, merus, carpus, propodus, dactyl
    const legM = mat(LEG_PAGE(0), { rough: 0.5 }), dacM = mat(LEG_PAGE(1), { rough: 0.4 });
    const merusG = facet(tube(0.3, (t) => [0.062 + Math.sin(t * Math.PI) * 0.014, 0.036], [0, 0.15, 0.5, 0.85, 1], 6));
    const carpG = facet(tube(0.14, (t) => [0.05 + Math.sin(t * Math.PI) * 0.008, 0.032], [0, 0.5, 1], 6));
    const propG = facet(tube(0.22, (t) => [0.045 - t * 0.01, 0.028], [0, 0.5, 1], 6));
    const dacG = facet(tube(0.2, (t) => [0.034 * (1 - t) + 0.003, 0.024 * (1 - t) + 0.002], [0, 0.4, 0.8, 1], 5, 0.06));
    const coxaG = facet(tube(0.08, () => [0.055, 0.04], [0, 1], 6));
    for (const side of [1, -1]) for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group();
      const th = side > 0 ? 0.12 - i * 0.32 : Math.PI - 0.12 + i * 0.32;
      const r = rimR(th) * 0.9;
      hip.position.set(Math.cos(th) * r, -0.09, CZ + Math.sin(th) * r);
      const yaw = -Math.atan2(Math.sin(th), Math.cos(th));
      hip.rotation.set(0, yaw, 0, 'YXZ');
      const coxa = new THREE.Mesh(coxaG, legM); coxa.castShadow = true;
      hip.add(coxa);
      const knee = new THREE.Group(); knee.position.x = 0.07;
      const merus = new THREE.Mesh(merusG, legM); merus.castShadow = true;
      knee.add(merus);
      hip.add(knee);
      const ankle = new THREE.Group(); ankle.position.x = 0.3;
      ankle.add(new THREE.Mesh(carpG, legM));
      knee.add(ankle);
      const toe = new THREE.Group(); toe.position.x = 0.14;
      const prop = new THREE.Mesh(propG, legM); prop.castShadow = true;
      toe.add(prop);
      const dj = new THREE.Group(); dj.position.x = 0.22; dj.rotation.z = -0.45;
      const dac = new THREE.Mesh(dacG, dacM); dac.castShadow = true;
      dj.add(dac);
      toe.add(dj);
      ankle.add(toe);
      B.add(hip);
      this.legs.push({ hip, knee, ankle, toe, side, i, lift: 0, liftT: 1 + Math.random() * 4 });
    }
    // ---- the leather apron: a curved bib over his front and belly, tied round the shell with a strap
    const apM = mat(APRON_PAGE(), { rough: 0.85, side: THREE.DoubleSide });
    const ap = new THREE.PlaneGeometry(0.5, 0.36, 6, 4);
    const pa = ap.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i); pa.setZ(i, -x * x * 1.3 - (y < 0 ? y * y * 0.6 : 0)); }
    const apron = mk(ap, apM);
    apron.position.set(0, -0.2, CZ + CL * 0.94 + 0.05);
    apron.rotation.x = 0.12;
    B.add(apron);
    const strapM = mat(page('strap', 16, 64, (p) => { for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) p.set(x, y, at(LEATHER, x < 2 || x > 13 ? 5 : 3 + ((y >> 3) & 1) * 0.4)); stitches(p, 3, 0, 3, 63, '#d8c090', '#2a1408'); stitches(p, 12, 0, 12, 63, '#d8c090', '#2a1408'); }), { rough: 0.85 });
    const strapPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 16; k++) { const th = Math.PI / 2 + 0.55 + (k / 16) * (TAU - 1.1); const r = rimR(th) * 1.01; strapPts.push(new THREE.Vector3(Math.cos(th) * r, -0.075, CZ + Math.sin(th) * r)); }
    for (let k = 0; k < strapPts.length - 1; k++) {
      const a = strapPts[k], b = strapPts[k + 1];
      const sg = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.045, a.distanceTo(b) + 0.01), strapM);
      sg.position.copy(a).add(b).multiplyScalar(0.5); sg.lookAt(b.clone().add(B.position)); sg.lookAt(b);
      B.add(sg);
    }
    // tools in the pockets: a pencil, a little screwdriver, a folded ruler
    const pencil = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6)), mat(null, { color: '#e8b830', rough: 0.5 }));
    pencil.position.set(-0.13, -0.11, CZ + CL * 0.94 + 0.06); pencil.rotation.z = 0.25;
    const tipP = new THREE.Mesh(facet(new THREE.ConeGeometry(0.008, 0.025, 6)), mat(null, { color: '#e8c8a0' }));
    tipP.position.set(-0.145, -0.045, CZ + CL * 0.94 + 0.06); tipP.rotation.z = 0.25;
    const sdH = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6)), mat(null, { color: '#b82a1e', rough: 0.4 }));
    sdH.position.set(0.12, -0.09, CZ + CL * 0.94 + 0.07);
    const sdS = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4)), mat(null, { color: '#b8c0c8', metal: 0.35, rough: 0.3 }));
    sdS.position.set(0.12, -0.035, CZ + CL * 0.94 + 0.07);
    const rule = new THREE.Mesh(facet(new THREE.BoxGeometry(0.03, 0.08, 0.006)), mat(null, { color: '#e8d8a8' }));
    rule.position.set(0.155, -0.1, CZ + CL * 0.94 + 0.065); rule.rotation.z = -0.2;
    B.add(pencil, tipP, sdH, sdS, rule);
    // ---- brass monocle on his right eye, the chain swinging down to the apron
    const brass = mat(BRASS(), { rough: 0.3, metal: 0.35, emissive: '#3a2200', emissiveK: 0.25 });
    const mono = new THREE.Group();
    const ring = new THREE.Mesh(facet(new THREE.TorusGeometry(0.06, 0.009, 4, 12)), brass);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), new THREE.MeshStandardMaterial({ color: '#cfeeff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.4, depthWrite: false }));
    mono.add(ring, lens);
    mono.position.set(0, 0.21, 0.05);
    this.eyes[1].add(mono);
    const chainM = brass;
    for (let k = 0; k < 7; k++) {
      const l = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.002, 3, 6), chainM);
      l.position.set(0.12 + k * 0.006, 0.12 - k * 0.035, CZ + CL * 0.9 + 0.04 - k * 0.002);
      l.rotation.y = k % 2 ? Math.PI / 2 : 0;
      B.add(l);
    }
    // ---- a briar pipe clamped in the maxillipeds
    const pipeM = mat(BRIAR_PAGE(), { rough: 0.45 });
    const stem = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.008, 0.01, 0.16, 6)), mat(null, { color: '#1a1210', rough: 0.3 }));
    stem.position.set(0.06, -0.1, CZ + CL * 0.9 + 0.1); stem.rotation.set(0.3, 0, 1.15);
    const bowl = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.03, 0.024, 0.06, 8)), pipeM);
    bowl.position.set(0.135, -0.07, CZ + CL * 0.9 + 0.13);
    const ember = new THREE.Mesh(new THREE.CircleGeometry(0.024, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff8a3a').multiplyScalar(1.6) }));
    ember.rotation.x = -Math.PI / 2; ember.position.set(0.135, -0.039, CZ + CL * 0.9 + 0.13);
    this.pipeBowl.position.set(0.135, -0.03, CZ + CL * 0.9 + 0.13);
    B.add(stem, bowl, ember, this.pipeBowl);
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== glintM) m.castShadow = true; });
  }

  /** world point above his eye stalks (dialogue anchor) */
  head(out = new THREE.Vector3()) { return this.group.localToWorld(out.set(0, 1.2, 0.15)); }
  snip() { this.snipT = 0.6; }

  update(dt: number) {
    this.t += dt;
    const t = this.t, talk = this.talk = Math.max(0, this.talk - dt * 3), mv = Math.abs(this.move);
    const B = this.body;
    // breathing bob, a lean into his words, a sway when scuttling
    B.position.y = 0.5 + Math.sin(t * 1.9) * 0.012 + (mv > 0.05 ? Math.abs(Math.sin(t * 16)) * 0.035 : 0);
    B.rotation.z = damp(B.rotation.z, -this.move * 0.06 + Math.sin(t * 8) * 0.025 * talk, 6, dt);
    B.rotation.x = damp(B.rotation.x, talk * 0.06 + Math.sin(t * 1.3) * 0.015, 5, dt);
    const lx = this.lookX === null ? 0 : clamp((this.lookX - this.group.position.x) * 0.12, -0.35, 0.35);
    B.rotation.y = damp(B.rotation.y, lx * 0.4, 3, dt);
    // eyes: sway, track, and now and then fold down into the sockets (a crab's blink)
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 1; this.blinkT = 2.5 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt * 4);
    const fold = Math.sin(Math.min(1, this.blink) * Math.PI) * 0.9;
    this.eyes.forEach((e, i) => {
      const s = i === 0 ? -1 : 1;
      e.rotation.x = -0.1 + fold * 1.2 + Math.sin(t * 1.1 + i * 2) * 0.05 - talk * 0.12;
      e.rotation.z = damp(e.rotation.z, -s * 0.18 - lx * 0.8 + Math.sin(t * 1.6 + i) * 0.05, 4, dt);
    });
    // antennae whip lazily; antennules flick
    this.antennae.forEach((ch, i) => ch.forEach((j, k) => { if (k) { j.rotation.z = Math.sin(t * 2.1 + i * 1.7 + k) * 0.25 * k; j.rotation.y = Math.sin(t * 1.4 + i + k * 0.7) * 0.3; } }));
    this.antennules.forEach((a, i) => { const f = Math.max(0, Math.sin(t * 5 + i * 2.2)) ** 8; a.rotation.z = -f * 0.6; });
    // the mouth: maxillipeds part and flutter while he talks, idle munch otherwise
    const open = talk > 0.05 ? 0.35 + Math.abs(Math.sin(t * 17)) * 0.5 * talk : 0.08 + Math.max(0, Math.sin(t * 2.3)) * 0.12;
    this.mxp.forEach((h, i) => { const s = i === 0 ? -1 : 1; h.rotation.y = damp(h.rotation.y, s * open, 18, dt); });
    this.mxpInner.forEach((h, i) => { h.rotation.x = Math.sin(t * (24 + i * 3)) * (0.15 + talk * 0.3); });
    // claws: a snip on cue, gestures while talking, idle clacks
    this.snipT = Math.max(0, this.snipT - dt);
    const snip = this.snipT > 0 ? Math.abs(Math.sin(this.snipT * 16)) : 0;
    for (const c of this.claws) {
      const g = c.big ? 1 : -1;
      const lift = talk * (c.big ? 0.4 + Math.sin(t * 4.2) * 0.25 : 0.2 + Math.sin(t * 6.1) * 0.2);
      c.root.rotation.z = damp(c.root.rotation.z, (c.big ? 0.15 : -0.15) + g * (lift + snip * 0.25), 6, dt);
      c.wrist.rotation.z = damp(c.wrist.rotation.z, -0.15 + Math.sin(t * (c.big ? 0.8 : 1.3)) * 0.12 + talk * Math.sin(t * 5) * 0.2, 6, dt);
      const idle = c.big ? Math.max(0, Math.sin(t * 0.6)) ** 4 * 0.45 : Math.max(0, Math.sin(t * 1.7 + 1)) ** 6 * 0.35;
      c.finger.rotation.z = snip > 0 ? snip * 0.6 : idle + talk * Math.abs(Math.sin(t * 9)) * 0.3;
    }
    // legs: planted, shifting now and then; a tetrapod scuttle when moving sideways
    for (const L of this.legs) {
      const gaitA = (L.i + (L.side > 0 ? 0 : 1)) % 2 === 0;
      let lift = 0;
      if (mv > 0.05) lift = Math.max(0, Math.sin(t * 15 + (gaitA ? 0 : Math.PI))) * Math.min(1, mv);
      else {
        L.liftT -= dt;
        if (L.liftT <= 0) { L.lift = 1; L.liftT = 2 + Math.random() * 5; }
        L.lift = Math.max(0, L.lift - dt * 3.5);
        lift = Math.sin(Math.min(1, L.lift) * Math.PI) * 0.7;
      }
      const spread = [0.35, 0.12, -0.12, -0.35][L.i];
      const swing = mv > 0.05 ? Math.sin(t * 15 + (gaitA ? 0 : Math.PI)) * 0.12 * Math.sign(this.move) * L.side : 0;
      L.hip.rotation.y = -Math.atan2(Math.sin(L.side > 0 ? 0.12 - L.i * 0.32 : Math.PI - 0.12 + L.i * 0.32), Math.cos(L.side > 0 ? 0.12 - L.i * 0.32 : Math.PI - 0.12 + L.i * 0.32)) + spread * 0.2 + swing;
      L.hip.rotation.z = 0.32 + lift * 0.35 + Math.sin(t * 1.9) * 0.01;
      L.knee.rotation.z = 0.15;
      L.ankle.rotation.z = -1.2 - lift * 0.25;
      L.toe.rotation.z = -0.45 + lift * 0.2;
    }
    // the pipe: a few bubbles now and then (more while he's talking)
    this.puffT -= dt * (1 + talk * 2);
    if (this.puffT <= 0) { this.puffT = 1.6 + Math.random() * 1.4; this.onPuff?.(this.pipeBowl.getWorldPosition(this.tmp)); }
  }
}

// ================================================================== THE SHOP
const WOOD = ramp(['#1e140c', '#33241a', '#4a3828', '#625040', '#7c6a58', '#988672', '#b4a48e']);
/** weathered planks: grain, seams, nails with rust bleeding down, water stains, a green tide line at the bottom */
const PLANK_PAGE = (key: string, dark = 0) => page('plank' + key, 128, 128, (p) => {
  const pw = 16;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const pi = Math.floor(x / pw), lx = x % pw;
    let t = 3.2 - dark + (hash2(pi, 1, 77) - 0.5) * 1.2;
    t += Math.sin(y * 0.09 + pi * 2 + Math.sin(y * 0.03 + pi) * 2) * 0.25;
    if (lx === 0) t = 0.6 - dark * 0.3; else if (lx === 1) t += 0.9; else if (lx === pw - 1) t -= 0.8;
    const [f1, , id] = worley(x, y, 34, 51 + dark, 0);
    if (id < 0.25 && f1 < 13) t -= 0.8;                          // water stains
    if (y > 112) t -= (y - 112) * 0.08;                          // the damp bottom
    p.set(x, y, at(WOOD, t));
  }
  // grain: long wavy lines with breaks, and knots
  for (let pi = 0; pi < 128 / pw; pi++) for (let k = 0; k < 3; k++) {
    const off = 3 + Math.floor(hash2(pi, k, 78) * (pw - 6)), ph = hash2(pi, k, 79) * 6;
    for (let y = 0; y < 128; y++) { if (hash2(pi * 5 + k, Math.floor(y / 11), 80) < 0.2) continue; const x = pi * pw + off + Math.round(Math.sin(y * 0.08 + ph) * 1.2); p.set(x, y, at(WOOD, 1.6 - dark * 0.5)); }
    if (k === 0 && hash2(pi, 9, 81) < 0.5) { const ky = 20 + Math.floor(hash2(pi, 10, 81) * 80), kx = pi * pw + 5 + Math.floor(hash2(pi, 11, 81) * 6); p.ellipse(kx, ky, 2.6, 4, at(WOOD, 1)); p.ellipse(kx, ky, 1.2, 2, at(WOOD, 3)); }
  }
  // nails at the cross-battens, rust bleeding below each
  for (let pi = 0; pi < 128 / pw; pi++) for (const ny of [10, 70]) {
    const x = pi * pw + 7, y = ny + Math.floor(hash2(pi, ny, 82) * 3);
    p.set(x, y, '#1a1612'); p.set(x + 1, y, '#3a342e'); p.set(x, y - 1, '#7a746a'); p.set(x + 1, y + 1, '#100c0a');
    const len = 5 + Math.floor(hash2(pi, ny, 83) * 9);
    for (let k = 2; k < len; k++) { p.set(x, y + k, k < len * 0.5 ? '#7a3814' : '#5e2c12'); if (k % 3 === 0) p.set(x + 1, y + k, '#6a3014'); }
  }
  // algae and a tide line along the bottom
  for (let x = 0; x < 128; x++) { const h = 3 + Math.floor((Math.sin(x * 0.3) + 1) * 2 + hash2(x, 0, 84) * 3); for (let y = 128 - h; y < 128; y++) p.set(x, y, y > 125 - h * 0.4 ? '#1e2a14' : '#33421e'); p.set(x, 127 - h, '#4a5a2a'); }
});
const METAL_PAGE = () => page('metal', 64, 64, (p) => {
  const ST = ramp(['#22262a', '#353b42', '#4a525c', '#626c78', '#7c8794']);
  const RU = ramp(['#3a1606', '#5e260c', '#843a14', '#a8521e', '#c87430']);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const corr = Math.floor(x / 8) % 2 === 0 ? 0.6 : -0.3;           // corrugation bands
    const [f1, , id] = worley(x, y, 18, 61, 0);
    const rusty = id < 0.45 && f1 < 7 + id * 9;
    p.set(x, y, rusty ? at(RU, 2.4 + corr - f1 * 0.08) : at(ST, 2.4 + corr));
  }
  // rivets along the edges with rust streaks running down from each
  for (let x = 4; x < 64; x += 12) for (const y of [3, 56]) {
    p.set(x, y, '#9aa4b0'); p.set(x + 1, y, '#5a626c'); p.set(x, y + 1, '#5a626c'); p.set(x + 1, y + 1, '#2a2e34');
    for (let k = 2; k < 10 && y + k < 64; k++) p.set(x, y + k, k < 6 ? '#8a3e16' : '#6a2e10');
  }
});
const ROPE_PAGE = () => page('rope', 16, 64, (p) => {
  const R = ramp(['#3a2812', '#5a4222', '#7e6236', '#a08450', '#c4aa74']);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) { const k = ((x + y * 0.8) % 6) / 6; p.set(x, y, at(R, k < 0.15 ? 0.5 : k < 0.5 ? 3.2 - k * 2 : 2 - (k - 0.5) * 2)); }
  for (let y = 2; y < 64; y += 5) p.set((y * 3) % 16, y, '#d8c494');
});
const CANVAS_PAGE = () => page('canvas', 64, 64, (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const stripe = Math.floor(x / 10) % 2 === 0;
    let c = stripe ? hex('#5a1c12') : hex('#7e705a');
    const fade = (y / 64) * 0.3;
    c = [c[0] * (1 - fade) + 70 * fade, c[1] * (1 - fade) + 78 * fade, c[2] * (1 - fade) + 56 * fade];   // greening toward the tattered hem
    if ((x + y) % 4 === 0) c = [c[0] * 0.93, c[1] * 0.93, c[2] * 0.93];      // the weave
    const [f1, , id] = worley(x, y, 22, 71, 0);
    if (id < 0.22 && f1 < 6) c = [c[0] * 0.75, c[1] * 0.78, c[2] * 0.7];    // stains
    p.set(x, y, c);
  }
  // a stitched patch and the tattered bottom edge (alpha-cut zigzag)
  rect(p, 36, 18, 14, 12, '#7a8a6a'); stitches(p, 36, 18, 49, 18, '#e8dcc0', '#3a4030'); stitches(p, 36, 29, 49, 29, '#e8dcc0', '#3a4030'); stitches(p, 36, 18, 36, 29, '#e8dcc0', '#3a4030'); stitches(p, 49, 18, 49, 29, '#e8dcc0', '#3a4030');
  for (let x = 0; x < 64; x++) { const cut = 4 + Math.floor((Math.sin(x * 0.9) + 1) * 2 + hash2(x, 3, 72) * 4); for (let y = 64 - cut; y < 64; y++) p.set(x, y, '#000000', 0); }
  for (const [x0, y0] of [[12, 40], [52, 46]]) p.ellipse(x0, y0, 2.6, 3.4, '#000000', 0);    // holes
});
const PAPER_PAGE = () => page('paper', 32, 32, (p) => {
  rect(p, 0, 0, 32, 32, '#e8dcbc');
  for (let y = 4; y < 30; y += 3) for (let x = 3; x < 29; x++) if (hash2(x >> 1, y, 91) < 0.7) p.set(x, y, x > 22 ? '#3a3a6a' : '#5a5040');
  rect(p, 0, 0, 32, 1, '#c8b88e'); rect(p, 21, 2, 1, 28, '#c86a5a');
});
const SPONGE_PAGE = (c: string) => page('sponge' + c, 16, 32, (p) => {
  const b = hex(c);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) { const k = 0.75 + Math.sin(x * 1.2) * 0.1 + (y < 3 ? 0.25 : 0); p.set(x, y, [b[0] * k, b[1] * k, b[2] * k]); }
  for (let y = 4; y < 30; y += 4) for (let x = (y / 4) % 2 ? 1 : 3; x < 16; x += 4) p.set(x, y, [b[0] * 0.45, b[1] * 0.45, b[2] * 0.45]);
});
const KELP_PAGE = () => page('kelp', 16, 64, (p) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) {
    const w = 5 + Math.sin(y * 0.25) * 2;
    if (Math.abs(x - 7.5) > w) { p.set(x, y, '#000000', 0); continue; }
    p.set(x, y, Math.abs(x - 7.5) < 1 ? '#6a6a20' : Math.abs(x - 7.5) > w - 1 ? '#3a4a14' : '#5a6a1e');
  }
});
const GLASS_PAGE = () => page('glass', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, '#bfe8e0', 70);
  for (let y = 2; y < 30; y++) { p.set(4, y, '#ffffff', 230); p.set(5, y, '#e8fffa', 150); if (y > 6 && y < 22) p.set(9, y, '#ffffff', 120); }
  for (let x = 0; x < 32; x++) { p.set(x, 0, '#e8fff8', 190); p.set(x, 31, '#8ab8b0', 160); }
});
const SIGN_PAGE = () => page('sign', 192, 56, (p) => {
  // a weathered board with chipped paint lettering
  for (let y = 0; y < 56; y++) for (let x = 0; x < 192; x++) {
    let t = 3 + Math.sin(x * 0.05 + Math.sin(y * 0.3) * 1.2) * 0.3 + (y % 14 === 0 ? -1.4 : y % 14 === 1 ? 0.7 : 0);
    if (x < 3 || x > 188 || y < 2 || y > 53) t -= 1;
    p.set(x, y, at(WOOD, t));
  }
  for (let x = 0; x < 192; x += 3) if (hash2(x, 1, 93) < 0.6) p.set(x, 27, at(WOOD, 1.4));
  const cv = p.canvas();
  const ctx = cv.getContext('2d')!;
  drawText(ctx, "MR. CRAB'S", 96, 7, { font: 'title', color: '#f4e6c0', color2: '#e8c888', outline: '#5a1a10', shadow: '#1a0a04', align: 'center' });
  drawText(ctx, '— ARMS & ODDITIES —', 96, 34, { font: 'small', color: '#e8d8b0', outline: '#2a1408', align: 'center' });
  const img = ctx.getImageData(0, 0, 192, 56).data;
  for (let i = 0; i < 192 * 56; i++) if (img[i * 4 + 3] > 0) p.d.set([img[i * 4], img[i * 4 + 1], img[i * 4 + 2], 255], i * 4);
  // chips in the paint: little bare-wood bites out of the letters
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(hash2(k, 1, 94) * 192), y = 8 + Math.floor(hash2(k, 2, 94) * 38);
    const i = (y * 192 + x) * 4;
    if (p.d[i] > 150) { p.set(x, y, at(WOOD, 3)); p.set(x + 1, y, at(WOOD, 2.4)); }
  }
  // nail heads in the corners
  for (const [x, y] of [[5, 5], [185, 5], [5, 49], [185, 49]]) { p.set(x, y, '#2a2420'); p.set(x + 1, y, '#5a524a'); p.set(x, y + 1, '#7a3814'); p.set(x, y + 2, '#5e2c12'); }
});
const TAG_PAGE = (price: string) => page('tag' + price, 24, 12, (p) => {
  rect(p, 0, 0, 24, 12, '#ece0bc'); rect(p, 0, 11, 24, 1, '#b8a87e'); rect(p, 23, 0, 1, 12, '#c8b88e');
  p.set(2, 5, '#5a4a2a'); p.set(2, 6, '#5a4a2a');
  const cv = p.canvas(); const ctx = cv.getContext('2d')!;
  drawText(ctx, price, 14, 2, { font: 'small', color: '#7a1a10', align: 'center' });
  const img = ctx.getImageData(0, 0, 24, 12).data;
  for (let i = 0; i < 24 * 12; i++) if (img[i * 4] < 160 && img[i * 4 + 3] > 0) p.d.set([img[i * 4], img[i * 4 + 1], img[i * 4 + 2], 255], i * 4);
});

/** a UV-scaled box: the page repeats at about `ppm` texels per metre on every face */
function plankBox(w: number, h: number, d: number, m: THREE.Material, ppm = 0.9) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * ppm, uv.getY(i) * dims[f][1] * ppm); }
  return mk(g, m);
}

export class CrabShop {
  group = new THREE.Group();
  /** where Mr. Crab stands behind his counter (local) */
  counter = new THREE.Vector3(0, 0.98, 0.55);
  /** lamp anchors (local) */
  private lanternPt = new THREE.Vector3(-1.0, 1.32, 0.78);
  private jarPt = new THREE.Vector3(1.05, 1.15, 0.72);
  private rimPt = new THREE.Vector3(0.4, 2.9, -1.6);
  private lamps: LampHandle[] = [];
  private awning: THREE.Mesh;
  private awningBase: Float32Array;
  private kelp: { m: THREE.Mesh; base: Float32Array; ph: number }[] = [];
  private hanging: { o: THREE.Object3D; ph: number }[] = [];
  private glow: THREE.Mesh[] = [];
  private flame: THREE.Mesh;
  private t = 0;

  constructor() {
    const g = this.group;
    const cab = new THREE.Group();
    cab.rotation.set(0.02, 0, -0.045);
    cab.position.y = -0.28;                       // half buried
    g.add(cab);
    const plank = mat(PLANK_PAGE('a'), { rough: 0.85 }), plankDark = mat(PLANK_PAGE('b', 1.2), { rough: 0.9 });
    const metal = mat(METAL_PAGE(), { rough: 0.6, metal: 0.3 });
    const rope = mat(ROPE_PAGE(), { rough: 0.9 });
    const brass = mat(BRASS(), { rough: 0.3, metal: 0.35, emissive: '#3a2200', emissiveK: 0.2 });
    const W = 3.3, H = 2.5, D = 2.0;
    // ---- the cabin: back + side walls, front posts, the lower front wall (counter), header and a broken roof
    const back = plankBox(W, H, 0.1, plankDark); back.position.set(0, H / 2, -D / 2); cab.add(back);
    for (const s of [-1, 1]) { const side = plankBox(0.1, H, D, plank); side.position.set(s * W / 2, H / 2, 0); cab.add(side); }
    for (const s of [-1, 1]) { const post = plankBox(0.42, H, 0.14, plank); post.position.set(s * (W / 2 - 0.19), H / 2, D / 2); cab.add(post); }
    const lower = plankBox(W - 0.8, 1.2, 0.12, plank); lower.position.set(0, 0.6, D / 2); cab.add(lower);
    const header = plankBox(W, 0.36, 0.16, plank); header.position.set(0, H - 0.1, D / 2 + 0.02); cab.add(header);
    const roof = plankBox(W + 0.3, 0.1, D + 0.5, plank); roof.position.set(0.15, H + 0.12, 0.1); roof.rotation.x = -0.12; cab.add(roof);
    const roofBit = plankBox(0.7, 0.08, 0.9, plankDark); roofBit.position.set(-1.45, H + 0.02, -0.6); roofBit.rotation.set(-0.5, 0.2, 0.4); cab.add(roofBit);
    // the counter top: a thick plank, a little proud of the wall
    const top = plankBox(W - 0.7, 0.09, 0.62, mat(PLANK_PAGE('c', 0.3), { rough: 0.7 }), 1.2); top.position.set(0, 1.24, D / 2 + 0.12); cab.add(top);
    this.counter.set(0.0, 1.24 + 0.045 - 0.28, D / 2 + 0.08);
    // rusted sheet metal patches nailed over holes
    const m1 = plankBox(0.8, 0.6, 0.03, metal, 1.4); m1.position.set(-0.9, 0.55, D / 2 + 0.08); m1.rotation.z = 0.08; cab.add(m1);
    const m2 = plankBox(0.03, 0.9, 0.7, metal, 1.4); m2.position.set(W / 2 + 0.06, 1.5, -0.3); m2.rotation.x = -0.1; cab.add(m2);
    // a porthole in the side wall
    const port = new THREE.Mesh(facet(new THREE.TorusGeometry(0.22, 0.05, 5, 12)), brass);
    port.position.set(-W / 2 - 0.06, 1.55, 0.1); port.rotation.y = Math.PI / 2; cab.add(port);
    const portGlass = new THREE.Mesh(new THREE.CircleGeometry(0.2, 12), new THREE.MeshStandardMaterial({ map: GLASS_PAGE(), transparent: true, roughness: 0.05, metalness: 0.3, depthWrite: false, side: THREE.DoubleSide }));
    portGlass.position.set(-W / 2 - 0.07, 1.55, 0.1); portGlass.rotation.y = -Math.PI / 2; cab.add(portGlass);
    // rope lashings round the front posts
    for (const s of [-1, 1]) for (const y of [0.4, 1.9]) for (let k = 0; k < 3; k++) {
      const r = new THREE.Mesh(facet(new THREE.TorusGeometry(0.26, 0.026, 4, 8)), rope);
      r.scale.set(0.95, 1, 0.5);
      r.position.set(s * (W / 2 - 0.19), y + k * 0.07, D / 2); r.rotation.x = Math.PI / 2; cab.add(r);
    }
    // the weapon wall inside: a dark pegboard + the weapons, each with a price tag
    const peg = plankBox(W - 1.0, 1.0, 0.04, mat(PLANK_PAGE('d', 2), { rough: 0.9 })); peg.position.set(0, 1.85, -D / 2 + 0.08); cab.add(peg);
    const wpns: [THREE.Object3D, string, number][] = [[toothpicks(), '2g', -1.0], [forkTrident(), '6g', -0.5], [nailDagger(), '4g', 0.0], [hookScythe(), '12g', 0.5], [pencilSpear(), '8g', 1.0]];
    for (const [w, price, x] of wpns) {
      const piv = new THREE.Group(); piv.position.set(x, 2.25, -D / 2 + 0.14);
      w.position.y = -0.38; piv.add(w);
      const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), mat(TAG_PAGE(price), { rough: 0.9, side: THREE.DoubleSide }));
      tag.position.set(0.12, -0.72, 0.05); tag.rotation.z = 0.2;
      const thread = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.12, 0.004), mat(null, { color: '#d8c8a0' }));
      thread.position.set(0.06, -0.66, 0.04); thread.rotation.z = 0.6;
      piv.add(tag, thread);
      cab.add(piv);
      this.hanging.push({ o: piv, ph: x * 3 });
    }
    // ---- on the counter: jars of oddities, a brass scale, the ledger, a shell bell, the lantern, the glow jar
    const ct = new THREE.Group(); ct.position.set(0, 1.285, D / 2 + 0.12); cab.add(ct);
    const glassM = new THREE.MeshStandardMaterial({ map: GLASS_PAGE(), transparent: true, roughness: 0.05, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide });
    const lidM = mat(null, { color: '#5a5048', metal: 0.3, rough: 0.5 });
    const jar = (x: number, z: number, h: number, inner: (j: THREE.Group) => void) => {
      const j = new THREE.Group(); j.position.set(x, 0, z);
      inner(j);
      const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, h, 10, 1, true), glassM); gl.position.y = h / 2; gl.renderOrder = 3;
      const lid = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.095, 0.095, 0.03, 10)), lidM); lid.position.y = h + 0.015;
      j.add(gl, lid); ct.add(j);
    };
    jar(-0.95, 0.13, 0.22, (j) => { // an eyeball in brine
      const eb = new THREE.Mesh(facet(new THREE.IcosahedronGeometry(0.05, 1)), mat(page('eyeball', 16, 16, (p) => { rect(p, 0, 0, 16, 16, '#f0e8dc'); p.ellipse(8, 8, 4, 4, '#4a8a5a'); p.ellipse(8, 8, 2, 2, '#0a0a0a'); p.set(7, 7, '#ffffff'); for (const [x, y] of [[1, 3], [2, 4], [14, 11], [13, 12], [12, 12]]) p.set(x, y, '#c83a3a'); }), { rough: 0.3 }));
      eb.position.y = 0.08; eb.rotation.set(0.3, 1.9, 0); j.add(eb);
      const brine = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.15, 10), new THREE.MeshStandardMaterial({ color: '#c8d870', transparent: true, opacity: 0.35, roughness: 0.2, depthWrite: false })); brine.position.y = 0.075; j.add(brine);
    });
    jar(-0.76, -0.17, 0.17, (j) => { // pebbles and sea glass
      for (let k = 0; k < 9; k++) { const s = new THREE.Mesh(facet(new THREE.DodecahedronGeometry(0.022, 0)), mat(null, { color: ['#7ac8b0', '#c8a070', '#8a8a9a', '#e8e0c8', '#5aa0c8'][k % 5], rough: 0.4 })); s.position.set(Math.cos(k * 2.4) * 0.045, 0.025 + Math.floor(k / 4) * 0.035, Math.sin(k * 2.4) * 0.045); j.add(s); }
    });
    // the brass scale
    const sc = new THREE.Group(); sc.position.set(1.12, 0, -0.17); ct.add(sc);
    const base = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.08, 0.1, 0.03, 8)), brass); base.position.y = 0.015;
    const col = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6)), brass); col.position.y = 0.17;
    const beam = new THREE.Mesh(facet(new THREE.BoxGeometry(0.36, 0.015, 0.015)), brass); beam.position.y = 0.32; beam.rotation.z = 0.06;
    sc.add(base, col, beam);
    for (const s of [-1, 1]) {
      const pan = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.07, 0.05, 0.02, 8)), brass); pan.position.set(s * 0.17, 0.17 + s * -0.01, 0);
      const str = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.15, 0.003), brass); str.position.set(s * 0.17, 0.25, 0);
      sc.add(pan, str);
    }
    const pearl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 1), mat(null, { color: '#f4ecf0', rough: 0.15, emissive: '#3a3040', emissiveK: 0.3 })); pearl.position.set(-0.17, 0.2, 0); sc.add(pearl);
    // the ledger: an open book, pages full of tallies
    const book = new THREE.Group(); book.position.set(0.86, 0, 0.17); book.rotation.y = -0.25; book.scale.setScalar(0.75); ct.add(book);
    const cover = new THREE.Mesh(facet(new THREE.BoxGeometry(0.36, 0.015, 0.25)), mat(null, { color: '#4a1a12', rough: 0.8 })); cover.position.y = 0.008; book.add(cover);
    for (const s of [-1, 1]) { const pg = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.22), mat(PAPER_PAGE(), { rough: 0.9 })); pg.rotation.set(-Math.PI / 2, 0, s * -0.06); pg.position.set(s * 0.085, 0.02 + 0.006, 0); book.add(pg); }
    const quill = new THREE.Mesh(facet(new THREE.ConeGeometry(0.012, 0.18, 4)), mat(null, { color: '#e8e4d8', rough: 0.7 })); quill.position.set(0.12, 0.04, -0.02); quill.rotation.set(0, 0, 1.3); book.add(quill);
    // a shell bell (a ribbed scallop dome on a little wooden foot)
    const bell = new THREE.Group(); bell.position.set(1.2, 0, 0.2); ct.add(bell);
    const foot = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 8)), mat(PLANK_PAGE('c', -0.4), { rough: 0.7 })); foot.position.y = 0.012;
    const dome = new THREE.Mesh(facet(new THREE.SphereGeometry(0.07, 10, 4, 0, TAU, 0, Math.PI / 2)), mat(page('scallop', 32, 16, (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, x % 4 === 0 ? '#c86a5a' : y < 4 ? '#fff0e4' : '#f4c4b0'); }), { rough: 0.35 }));
    dome.position.y = 0.025;
    const knob = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 6)), brass); knob.position.y = 0.105;
    bell.add(foot, dome, knob);
    // the lantern: brass cage, glass, a warm core (and the key light)
    const lan = new THREE.Group(); lan.position.set(-1.18, 0, -0.1); ct.add(lan);
    const lb = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.09, 0.1, 0.04, 6)), brass); lb.position.y = 0.02;
    const lt = new THREE.Mesh(facet(new THREE.ConeGeometry(0.11, 0.1, 6)), brass); lt.position.y = 0.32;
    const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.22, 6, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd8a0', emissive: '#ff9a40', emissiveIntensity: 0.15, transparent: true, opacity: 0.4, roughness: 0.1, depthWrite: false })); lg.position.y = 0.15;
    for (let k = 0; k < 6; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.24, 0.008), brass); const a = (k / 6) * TAU; bar.position.set(Math.cos(a) * 0.085, 0.15, Math.sin(a) * 0.085); lan.add(bar); }
    this.flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.026, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb850') })); this.flame.position.y = 0.14;
    const handle = new THREE.Mesh(facet(new THREE.TorusGeometry(0.05, 0.007, 3, 8, Math.PI)), brass); handle.position.y = 0.37;
    lan.add(lb, lt, lg, this.flame, handle);
    this.lanternPt.set(-1.18, 1.285 + 0.15 - 0.28, D / 2 + 0.02);
    // the bioluminescent jar: glowing plankton blobs that pulse
    const bj = new THREE.Group(); bj.position.set(0.8, 0, -0.2); ct.add(bj);
    for (let k = 0; k < 7; k++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016 + (k % 3) * 0.005, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#5affe0') }));
      b.position.set(Math.cos(k * 2.1) * 0.04, 0.05 + (k % 4) * 0.04, Math.sin(k * 2.1) * 0.04);
      bj.add(b); this.glow.push(b);
    }
    const bjg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.24, 10, 1, true), glassM); bjg.position.y = 0.12; bjg.renderOrder = 3;
    const bjl = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.06, 0.08, 0.04, 10)), mat(null, { color: '#6a4a2a', rough: 0.9 })); bjl.position.y = 0.26;
    bj.add(bjg, bjl);
    this.jarPt.set(0.8, 1.285 + 0.12 - 0.28, D / 2 - 0.08);
    // ---- the sign over the window
    const sign = new THREE.Mesh(facet(new THREE.BoxGeometry(2.0, 0.58, 0.06)), [plankDark, plankDark, plankDark, plankDark, mat(SIGN_PAGE(), { rough: 0.8 }), plankDark]);
    sign.position.set(0, H + 0.42, D / 2 + 0.14); sign.rotation.z = 0.035; sign.castShadow = true;
    cab.add(sign);
    for (const s of [-1, 1]) { const r = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4)), rope); r.position.set(s * 0.8, H + 0.12, D / 2 + 0.14); cab.add(r); }
    // ---- the tattered canvas awning, flapping in the current
    const aw = new THREE.PlaneGeometry(W + 0.4, 1.0, 8, 5);
    aw.rotateX(-Math.PI / 2);
    this.awning = new THREE.Mesh(aw, mat(CANVAS_PAGE(), { rough: 0.9, side: THREE.DoubleSide, alphaTest: 0.5, flat: false }));
    this.awning.position.set(0, H + 0.12, D / 2 + 0.5);
    this.awning.rotation.x = 0.2;
    this.awning.castShadow = true;
    this.awningBase = new Float32Array((aw.attributes.position as THREE.BufferAttribute).array);
    cab.add(this.awning);
    for (const s of [-1, 1]) { const pole = plankBox(0.06, 1.9, 0.06, plankDark); pole.position.set(s * (W / 2 + 0.1), H - 0.85, D / 2 + 0.98); pole.rotation.z = s * 0.06; cab.add(pole); }
    // ---- growth: barnacles on the lower walls, tube sponges at a corner, kelp from the roof
    const bm = mat(BARNACLE_PAGE(), { rough: 0.8 }), holeM = mat(null, { color: '#14100c', rough: 0.95 });
    for (let k = 0; k < 14; k++) {
      const x = -W / 2 + 0.2 + hash2(k, 1, 95) * (W - 0.4), y = 0.3 + hash2(k, 2, 95) * 0.5, s = 0.6 + hash2(k, 3, 95) * 0.7;
      const c = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.02 * s, 0.045 * s, 0.045 * s, 6, 1, true)), bm); c.rotation.x = Math.PI / 2; c.position.set(x, y, D / 2 + 0.08 + 0.022 * s);
      const h = new THREE.Mesh(new THREE.CircleGeometry(0.019 * s, 6), holeM); h.position.set(x, y, D / 2 + 0.08 + 0.046 * s);
      cab.add(c, h);
    }
    for (const [x, z, h, c] of [[W / 2 + 0.12, 0.7, 0.55, '#e8b830'], [W / 2 + 0.2, 0.5, 0.4, '#e8b830'], [W / 2 + 0.05, 0.4, 0.7, '#9a5ac8'], [-W / 2 - 0.15, 0.85, 0.45, '#e86a3a']] as [number, number, number, string][]) {
      const sp = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.07, 0.05, h, 7, 1, true)), mat(SPONGE_PAGE(c), { rough: 0.9, side: THREE.DoubleSide }));
      sp.position.set(x, h / 2 + 0.25, z); sp.rotation.z = (x > 0 ? -1 : 1) * 0.15;
      const in_ = new THREE.Mesh(new THREE.CircleGeometry(0.065, 7), holeM); in_.rotation.x = -Math.PI / 2; in_.position.set(x + (x > 0 ? -1 : 1) * h * 0.07, h + 0.25, z);
      cab.add(sp, in_);
    }
    const kelpM = mat(KELP_PAGE(), { rough: 0.8, side: THREE.DoubleSide, alphaTest: 0.5, flat: false });
    for (const [x, z, h] of [[-1.3, 0.8, 1.6], [1.25, -0.6, 2.0], [-0.4, -0.9, 1.3]] as [number, number, number][]) {
      const kg = new THREE.PlaneGeometry(0.2, h, 1, 8); kg.translate(0, h / 2, 0);
      const km = new THREE.Mesh(kg, kelpM); km.position.set(x, H + 0.15, z); km.castShadow = true;
      cab.add(km);
      this.kelp.push({ m: km, base: new Float32Array((kg.attributes.position as THREE.BufferAttribute).array), ph: x * 2 });
    }
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !(m.material instanceof THREE.MeshBasicMaterial) && !(m.material as THREE.Material).transparent) { m.castShadow = true; m.receiveShadow = true; } });
    // the cabin is tilted and sunk: convert the anchors from cabin space
    cab.updateMatrix();
    for (const v of [this.counter, this.lanternPt, this.jarPt]) v.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(cab.rotation)).add(new THREE.Vector3(0, 0, 0));
  }

  /** warm lantern key, cyan glow jar, cool rim behind: pooled point lights from the scene's Lighting rig */
  setLighting(rig: { lamp(x: number, y: number, z: number, color: string, intensity?: number, distance?: number): LampHandle | null } | null) {
    for (const l of this.lamps) l.release();
    this.lamps = [];
    if (!rig) return;
    this.group.updateMatrixWorld(true);
    const w = (v: THREE.Vector3) => this.group.localToWorld(v.clone());
    const a = w(this.lanternPt), b = w(this.jarPt), c = w(this.rimPt);
    for (const [p, col, k, d] of [[a, '#ffae5a', 2.4, 5], [b, '#4afff0', 1.4, 3.2], [c, '#a8dcff', 4, 7]] as [THREE.Vector3, string, number, number][]) {
      const l = rig.lamp(p.x, p.y + 0.1, p.z + 0.55, col, k, d);
      if (l) this.lamps.push(l);
    }
  }
  release() { for (const l of this.lamps) l.release(); this.lamps = []; }

  update(dt: number) {
    this.t += dt;
    const t = this.t;
    // the awning billows and its torn edge flutters
    const pa = this.awning.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      const x = this.awningBase[i * 3], z = this.awningBase[i * 3 + 2];
      const out = (z + 0.5) / 1.0;
      pa.setY(i, this.awningBase[i * 3 + 1] + Math.sin(t * 2.2 + x * 1.3) * 0.06 * out + Math.sin(t * 5.3 + x * 4) * 0.025 * out * out);
    }
    pa.needsUpdate = true;
    this.awning.geometry.computeVertexNormals();
    for (const k of this.kelp) {
      const p = k.m.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const y = k.base[i * 3 + 1]; p.setX(i, k.base[i * 3] + Math.sin(t * 1.3 + y * 1.6 + k.ph) * 0.12 * y); p.setZ(i, Math.sin(t * 0.9 + y + k.ph) * 0.08 * y); }
      p.needsUpdate = true;
    }
    for (const h of this.hanging) h.o.rotation.z = Math.sin(t * 1.1 + h.ph) * 0.06;
    this.glow.forEach((b, i) => { const k = 0.55 + Math.sin(t * 2 + i * 1.3) * 0.35; (b.material as THREE.MeshBasicMaterial).color.setRGB(0.35 * k, 1.0 * k, 0.88 * k); b.position.y += Math.sin(t * 1.5 + i) * 0.0004; });
    this.flame.scale.setScalar(0.9 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.1) * 0.06);
    const f = 0.88 + Math.sin(t * 9) * 0.06 + Math.sin(t * 13.7) * 0.05;
    if (this.lamps[0]) this.lamps[0].light.intensity = 2.4 * f;
    if (this.lamps[1]) this.lamps[1].light.intensity = 1.4 * (0.8 + Math.sin(t * 2) * 0.2);
  }
}

// ------------------------------------------------------------------ the weapon wall's stock
const steel = () => mat(null, { color: '#9aa4ae', metal: 0.35, rough: 0.35 });
const rusty = () => mat(METAL_PAGE(), { rough: 0.7, metal: 0.2 });
const woodM = () => mat(PLANK_PAGE('c', -0.4), { rough: 0.7 });
function toothpicks(): THREE.Group {
  const g = new THREE.Group();
  for (const a of [-0.35, 0.35]) {
    const p = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 5)), mat(null, { color: '#e8d4a0', rough: 0.6 }));
    p.rotation.z = a;
    const t1 = new THREE.Mesh(facet(new THREE.ConeGeometry(0.012, 0.06, 5)), mat(null, { color: '#d8c090' }));
    t1.position.set(-Math.sin(a) * 0.34, Math.cos(a) * 0.34, 0); t1.rotation.z = a;
    g.add(p, t1);
  }
  return g;
}
function forkTrident(): THREE.Group {
  const g = new THREE.Group(), m = steel();
  const h = new THREE.Mesh(facet(new THREE.BoxGeometry(0.035, 0.42, 0.012)), m); h.position.y = -0.1;
  const neck = new THREE.Mesh(facet(new THREE.BoxGeometry(0.07, 0.05, 0.01)), m); neck.position.y = 0.13;
  g.add(h, neck);
  for (let k = 0; k < 4; k++) { const tn = new THREE.Mesh(facet(new THREE.BoxGeometry(0.009, 0.16, 0.008)), m); tn.position.set(-0.03 + k * 0.02, 0.23, 0); g.add(tn); }
  return g;
}
function nailDagger(): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.014, 0.014, 0.44, 4)), rusty()); shaft.position.y = 0.05;
  const head = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.04, 0.04, 0.015, 6)), rusty()); head.position.y = -0.17;
  const tip = new THREE.Mesh(facet(new THREE.ConeGeometry(0.014, 0.06, 4)), rusty()); tip.position.y = 0.3;
  const wrap = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 6)), mat(ROPE_PAGE(), { rough: 0.9 })); wrap.position.y = -0.08;
  g.add(shaft, head, tip, wrap);
  return g;
}
function hookScythe(): THREE.Group {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.02, 0.025, 0.7, 5)), woodM()); stick.position.y = -0.05;
  const hook = new THREE.Mesh(facet(new THREE.TorusGeometry(0.12, 0.016, 4, 10, Math.PI * 1.3)), rusty()); hook.position.set(0.1, 0.3, 0); hook.rotation.z = -0.4;
  const barb = new THREE.Mesh(facet(new THREE.ConeGeometry(0.02, 0.06, 4)), rusty()); barb.position.set(0.2, 0.2, 0); barb.rotation.z = 2.4;
  const lash = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6)), mat(ROPE_PAGE(), { rough: 0.9 })); lash.position.y = 0.26;
  g.add(stick, hook, barb, lash);
  return g;
}
function pencilSpear(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6)), mat(null, { color: '#e8b830', rough: 0.5 })); body.position.y = 0;
  const wood = new THREE.Mesh(facet(new THREE.ConeGeometry(0.02, 0.07, 6)), mat(null, { color: '#e8c8a0' })); wood.position.y = 0.335;
  const lead = new THREE.Mesh(facet(new THREE.ConeGeometry(0.007, 0.025, 6)), mat(null, { color: '#2a2a30', rough: 0.3 })); lead.position.y = 0.375;
  const ferrule = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.021, 0.021, 0.04, 6)), mat(BRASS(), { metal: 0.35, rough: 0.35 })); ferrule.position.y = -0.31;
  const eraser = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 6)), mat(null, { color: '#e88a9a' })); eraser.position.y = -0.35;
  g.add(body, wood, lead, ferrule, eraser);
  return g;
}
