// Story props for the prologue, PS2-style: blocky flat-shaded low-poly with small clean painted pages (flat tones,
// deliberate shapes, no noise): Dad's sailor cap, Mom's shell necklace, the bread on its hook, giant glass bottles
// (human trash) to smash, Mr. Crab's training shell (the parry lesson), the tutorial's bubble rings, kelp gates,
// current and minnow, the trawl net that takes Mom and Dad, and the ruined home the tutorial ends at.
// (Mr. Crab and his shop: src/story/crab.ts.)
import * as THREE from 'three';
import { psxMat, mesh, facet, merge, xf } from '../player/psx';
import { ctex, T, rect, planks, tone } from '../skills/texkit';
import { hex } from '../gfx/px';
import { uw } from '../gfx/shaders/underwater';
import { jitter, boxUV, lpRock } from '../gfx/lowpoly';
import { bodyPoint } from '../player/blobShape';
import { buildHook } from '../fishing/bait';
import { TAU, segDist } from '../core/math';
import { bubbleCluster } from '../ui/text3d';
import { kelpGeo, kelpMat, KELP_T } from '../title/art';
import type { Entity, World, Team } from '../game/types';
import { attackPlayer } from '../combat/resolve';
import { buildFish, type FishModel } from '../fish';

const flat = (color: string, o: { rough?: number; metal?: number; emissive?: string; emissiveK?: number; side?: THREE.Side } = {}) => psxMat(null, { color, rough: o.rough ?? 0.75, metal: o.metal, emissive: o.emissive, emissiveK: o.emissiveK, side: o.side });
const M = <G extends THREE.BufferGeometry>(g: G, m: THREE.Material, shadow = true) => mesh(facet(g), m, shadow);

// ------------------------------------------------------------------ modelling helpers (lathes / strips into a page)
/** a texel rect on a page: x, y from the top-left, w, h */
type PgRect = [number, number, number, number];
/** a profile for lathe(): [radius, y] from the bottom up */
type Prof = [number, number][];
/** arc-length fractions along a profile (0 at the first point, 1 at the last) */
function profV(prof: Prof): number[] {
  const L = [0];
  for (let i = 1; i < prof.length; i++) L.push(L[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
  const tot = L[L.length - 1] || 1;
  return L.map((l) => l / tot);
}
/**
 * a faceted lathe: u runs round from the camera side (+z) toward +x, v runs up the profile by arc length, both
 * placed in the rect r of a W x H page (so a page can carry several parts). `arc` < 1 makes a partial band centred on
 * the front (labels); rmod(i, j) scales ring i's radius at side j (crimped caps, knurled lids, bumpy pickles).
 */
function lathe(prof: Prof, sides: number, page: [number, number], r: PgRect, o: { arc?: number; rmod?: (i: number, j: number) => number } = {}): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const vs = profV(prof), arc = o.arc ?? 1, a0 = -arc * Math.PI;
  for (let i = 0; i < prof.length; i++) for (let j = 0; j <= sides; j++) {
    const a = a0 + (j / sides) * arc * TAU, rr = prof[i][0] * (o.rmod ? o.rmod(i, j % sides) : 1);
    pos.push(Math.sin(a) * rr, prof[i][1], Math.cos(a) * rr);
    uv.push((r[0] + (j / sides) * r[2]) / page[0], 1 - (r[1] + (1 - vs[i]) * r[3]) / page[1]);
  }
  for (let i = 0; i + 1 < prof.length; i++) for (let j = 0; j < sides; j++) {
    const a = i * (sides + 1) + j, b = a + sides + 1;
    idx.push(a, a + 1, b + 1, a, b + 1, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  return f;
}
/** a strip of quads along a polyline (each point: centre + half-width vector): across the strip runs along the rect's
 *  x and along it down the rect's rows (0 at the first point); alongX swaps them (a long strip painted sideways) */
function strip(pts: { c: [number, number, number]; w: [number, number, number] }[], page: [number, number], r: PgRect, alongX = false): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  pts.forEach((p, i) => {
    const v = i / (pts.length - 1);
    for (const s of [-1, 1]) {
      pos.push(p.c[0] + p.w[0] * s, p.c[1] + p.w[1] * s, p.c[2] + p.w[2] * s);
      const across = s < 0 ? 0 : 1, a = alongX ? v : across, b = alongX ? across : v;
      uv.push((r[0] + a * r[2]) / page[0], 1 - (r[1] + b * r[3]) / page[1]);
    }
  });
  for (let i = 0; i + 1 < pts.length; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const f = g.toNonIndexed();
  f.computeVertexNormals();
  return f;
}
/** the profile row (0 = top of the rect) a profile point lands on, for painting bands that line up with the model */
const profRow = (prof: Prof, i: number, h: number) => Math.round((1 - profV(prof)[i]) * (h - 1));
/** one prop = one mesh: parts merged, one page, one matte material */
function propMesh(parts: THREE.BufferGeometry[], mat: THREE.Material, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), mat);
  m.castShadow = shadow; m.receiveShadow = shadow;
  return m;
}
/** a matte page material that shows both faces (thin sheets: ribbons, fronds, labels) and cuts alpha */
function sheetMat(tex: THREE.Texture, o: { rough?: number; alphaTest?: number } = {}) {
  const m = psxMat(tex, { rough: o.rough ?? 0.85, alphaTest: o.alphaTest ?? 0.5 });
  m.side = THREE.DoubleSide;
  return m;
}

// ------------------------------------------------------------------ Dad's sailor cap, Mom's shell necklace
/** the cap: a white canvas sailor's cap (rolled brim, a crown of six stitched panels, a stitched top), lathed */
const CAP_PROF: Prof = [[0.15, 0.0], [0.19, -0.006], [0.214, 0.014], [0.21, 0.04], [0.186, 0.05], [0.16, 0.046],
  [0.158, 0.06], [0.163, 0.1], [0.17, 0.13], [0.162, 0.148], [0.1, 0.16], [0, 0.164]];
/**
 * cap page (64 x 48): rows 0-31 the cap (u round, v from the button at the top down to the brim's underside: stitched
 * rings on the top, six crown panels with seams, the rolled brim with two rows of stitching, shaded underneath);
 * rows 32-39 the navy band with a gold anchor at the front and gold dashes; rows 40-47 the ribbon tails (navy with
 * two gold stripes and swallow-tail ends cut by alpha).
 */
const capTex = () => ctex('story.cap2', 64, 48, (p) => {
  const W = ['#8a8a84', '#b8b8b0', '#d8d6cc', '#ecebe2', '#fbfaf4'], N = T.navy;
  const top = profRow(CAP_PROF, 9, 32), crownLo = profRow(CAP_PROF, 6, 32), brimTop = profRow(CAP_PROF, 3, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    let c = W[3];
    if (y <= top) c = (y === 2 || y === 5) && x % 2 ? W[1] : y === 0 ? W[1] : W[4];            // the top: stitched rings
    else if (y < crownLo) c = x % (64 / 6) < 1 ? W[1] : ((x % (64 / 6)) < 2 ? W[4] : W[3]);  // six panels, a lit edge by each seam
    else c = y > brimTop + 3 ? W[0] : y > brimTop ? W[2] : (y === crownLo + 1 || y === brimTop - 1) && x % 2 ? W[1] : W[3];
    if (y === top + 1) c = W[1];
    p.set(x, y, c);
  }
  p.set(0, 0, N[2]); p.set(63, 0, N[2]);
  // the band: navy, a gold anchor at the front (u = 0 / 1 wraps round the camera side), gold dashes round the back
  for (let y = 32; y < 40; y++) for (let x = 0; x < 64; x++) p.set(x, y, tone(N, y === 32 ? 4 : y === 39 ? 0 : 2 + ((x + y) % 7 === 0 ? 1 : 0)));
  for (let x = 12; x < 52; x++) if (x % 4 < 2) p.set(x, 35, tone(T.gold, 3));
  for (const ax of [62, 1]) { for (let y = 33; y < 39; y++) p.set(ax, y, tone(T.gold, 4)); }
  for (const [ax, ay] of [[60, 34], [61, 34], [63, 34], [0, 34], [2, 34], [3, 34], [60, 38], [3, 38], [61, 39], [2, 39]] as [number, number][]) p.set(ax, ay, tone(T.gold, 3));
  // ribbons: navy, two gold stripes near the end, the swallow-tail notch cut out
  for (let y = 40; y < 48; y++) for (let x = 0; x < 64; x++) {
    const v = x / 63, across = (y - 40) / 7;
    if (v > 0.86 && v - 0.86 > (0.5 - Math.abs(across - 0.5)) * 0.28) continue;
    p.set(x, y, (v > 0.7 && v < 0.73) || (v > 0.76 && v < 0.78) ? tone(T.gold, 3) : tone(N, y === 40 ? 4 : y === 47 ? 1 : 2));
  }
});
/** a white sailor cap (rolled brim, stitched crown, navy band with a gold anchor, two ribbon tails); sits on the head anchor */
export function sailorCap(): THREE.Group {
  const g = new THREE.Group();
  const P: [number, number] = [64, 48];
  const mat = sheetMat(capTex(), { rough: 0.85 });
  const cap = lathe(CAP_PROF, 12, P, [0, 0, 64, 32]);
  const band = lathe([[0.161, 0.048], [0.166, 0.066], [0.168, 0.086]], 12, P, [0, 32, 64, 8]);
  // the ribbon tails: from the band at the back, hanging down and out, a little twist
  const tail = (s: number) => {
    const pts: { c: [number, number, number]; w: [number, number, number] }[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, tw = 0.25 * t * s;
      pts.push({ c: [-0.17 - t * 0.05, 0.06 - t * 0.15, s * (0.025 + t * 0.03)], w: [0, Math.sin(tw) * 0.018, Math.cos(tw) * 0.018] });
    }
    return strip(pts, P, [0, 40, 64, 8], true);
  };
  g.add(propMesh([cap, band, tail(1), tail(-1)], mat));
  g.rotation.z = -0.25; // jaunty
  g.scale.setScalar(1.05);
  return g;
}

/**
 * the necklace page (64 x 32): rows 0-3 the twisted cord; then three little shells (16 x 14 each: a tiger cowrie,
 * a pink turban shell, a cream nerite) and the pendant scallop (32 x 28: coral-pink ribs, cream growth rings).
 */
const neckTex = () => ctex('story.neck2', 64, 32, (p) => {
  for (let y = 0; y < 4; y++) for (let x = 0; x < 64; x++) p.set(x, y, tone(T.rope, ((x + y * 2) % 4 < 2 ? 2 : 1) + (y === 1 ? 1 : 0)));
  // tiger cowrie (0..15): cream with brown spots, a dark aperture line down the front
  for (let y = 4; y < 18; y++) for (let x = 0; x < 16; x++) {
    let c = y < 6 || y > 15 ? '#e8d8b8' : '#f4e6c8';
    if (((x * 5 + y * 3) % 7) < 2 && y > 5 && y < 16) c = (x + y) % 3 ? '#8a5a2a' : '#5a3418';
    if (x === 0 || x === 15) c = '#6a4020';
    p.set(x, y, c);
  }
  // turban shell (16..31): pink bands spiralling up, dark suture lines
  for (let y = 4; y < 18; y++) for (let x = 16; x < 32; x++) {
    const band = (y + Math.floor((x - 16) / 4)) % 5;
    p.set(x, y, band === 0 ? '#7a2a3a' : band < 3 ? '#e88ab0' : '#ffc0cc');
  }
  // nerite (rows 18-31, cols 0..31): cream with black zigzag lines
  for (let y = 18; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, Math.abs(((x + y * 2) % 8) - 4) < 1 ? '#2a2420' : y > 28 ? '#d8c8a8' : '#f4ecd8');
  // scallop (32..63, 4..31): radial ribs from the hinge (bottom middle), growth rings, coral to cream
  for (let y = 4; y < 32; y++) for (let x = 32; x < 64; x++) {
    const dx = (x + 0.5 - 48) / 16, dy = (31.5 - y) / 27, r = Math.hypot(dx, dy), a = Math.atan2(dx, dy);
    const rib = Math.abs(((a / 0.18) % 1 + 1) % 1 - 0.5) < 0.2;
    let c = r > 0.85 ? '#f07a6a' : r > 0.5 ? '#ffb0a0' : '#fff0dc';
    if (rib) c = r > 0.85 ? '#c84a40' : r > 0.5 ? '#f07a6a' : '#ffc890';
    if (Math.abs((r * 7) % 1 - 0.5) < 0.07) c = '#a83a30';
    p.set(x, y, c);
  }
});
/** a cord of small shells round the neck crease, on the camera side; add it to a BlobModel's body */
export function shellNecklace(): THREE.Group {
  const g = new THREE.Group();
  const P: [number, number] = [64, 32];
  const mat = psxMat(neckTex(), { rough: 0.8 });
  const pts: THREE.Vector3[] = [];
  const us = [0.46, 0.4, 0.34, 0.28, 0.22, 0.16, 0.1, 0.04];
  for (const u of us) pts.push(new THREE.Vector3(...bodyPoint(0.6, u, 0.025)));
  // the cord: a twisted rope through the points
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.008, 4, false);
  const uv = tube.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - (uv.getY(i) * 4) / 32);
  tube.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [tube];
  // the shells: each faces out from the body, hanging just below the cord; the scallop pendant in the middle
  const Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion(), e = new THREE.Euler();
  pts.slice(1, -1).forEach((p, i) => {
    const n = p.clone().normalize();
    q.setFromUnitVectors(Z, n); e.setFromQuaternion(q);
    let geo: THREE.BufferGeometry;
    if (i === 2) geo = scallop(P, [32, 4, 32, 28]);
    else if (i === 3) return;
    else if (i % 3 === 0) geo = lathe([[0, -0.03], [0.016, -0.026], [0.022, -0.01], [0.022, 0.012], [0.015, 0.026], [0, 0.03]], 7, P, [0, 4, 16, 14]);
    else if (i % 3 === 1) geo = lathe([[0, -0.02], [0.022, -0.016], [0.02, -0.004], [0.014, 0.006], [0.012, 0.016], [0.006, 0.024], [0, 0.03]], 7, P, [16, 4, 16, 14]);
    else geo = lathe([[0, -0.022], [0.02, -0.016], [0.024, 0], [0.016, 0.016], [0, 0.02]], 7, P, [0, 18, 32, 14]);
    if (i !== 2) geo.scale(1.5, 1.5, 0.9); else geo.scale(1.3, 1.3, 1.3);
    const at = p.clone().addScaledVector(n, 0.028).add(new THREE.Vector3(0, i === 2 ? -0.06 : -0.035, 0));
    parts.push(xf(geo, [at.x, at.y, at.z], [e.x, e.y, e.z]));
  });
  g.add(propMesh(parts, mat, false));
  return g;
}
/** a scallop shell: a fan of ribbed (corrugated) wedges from the hinge, with two little ears; faces +z, hinge at the top */
function scallop(page: [number, number], r: PgRect): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [];
  const N = 10, R = 0.05, hinge: [number, number] = [0, 0.012];
  const at = (k: number, rr: number): [number, number, number] => {
    const a = -1.15 + (k / N) * 2.3;
    return [Math.sin(a) * rr, hinge[1] - Math.cos(a) * rr, (k % 2 ? 0.006 : 0) + 0.012 * (1 - rr / R)];
  };
  const tuv = (x: number, y: number): [number, number] => [(r[0] + (0.5 + x / (2 * R)) * r[2]) / page[0], 1 - (r[1] + (1 - (hinge[1] - y) / (R * 1.05)) * r[3]) / page[1]];
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => { for (const v of [a, b, c]) { pos.push(...v); uv.push(...tuv(v[0], v[1])); } };
  const H: [number, number, number] = [hinge[0], hinge[1], 0.014];
  for (let k = 0; k < N; k++) {
    const a0 = at(k, R * 0.55), a1 = at(k + 1, R * 0.55), b0 = at(k, R), b1 = at(k + 1, R);
    tri(H, a1, a0); tri(a0, a1, b1); tri(a0, b1, b0);
  }
  // the ears either side of the hinge
  for (const s of [-1, 1]) tri([0, hinge[1], 0.012], [s * 0.026, hinge[1] + 0.004, 0.006], [s * 0.022, hinge[1] - 0.012, 0.008]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ bread on a hook
/** the slice's outline (m): a domed two-lobed top, straight sides, and a bite taken out of the lower right corner */
const BREAD_OUT: [number, number][] = [[-0.15, -0.17], [0.05, -0.17], [0.07, -0.152], [0.088, -0.158], [0.104, -0.138], [0.122, -0.146], [0.138, -0.122],
  [0.152, -0.112], [0.155, 0.05], [0.162, 0.1], [0.145, 0.148], [0.095, 0.174], [0.042, 0.165], [0.0, 0.142], [-0.042, 0.165], [-0.095, 0.174],
  [-0.145, 0.148], [-0.162, 0.1], [-0.155, 0.05]];
/**
 * the crumb face (48 x 48, the slice's outline projected flat): a baked crust round the edge (dark brown outside,
 * golden inside it), soft cream crumb with air pockets (each a shadowed pocket with a lit lip), a little toasting
 * toward the crust, and the bitten corner raw and torn (no crust there)
 */
const crumbTex = () => ctex('story.crumb2', 48, 48, (p) => {
  const toT = (x: number, y: number): [number, number] => [(x + 0.5) / 48 * 0.36 - 0.18, 0.19 - (y + 0.5) / 48 * 0.38];
  const inside = (px: number, py: number) => { let c = false; for (let i = 0, j = BREAD_OUT.length - 1; i < BREAD_OUT.length; j = i++) { const [xi, yi] = BREAD_OUT[i], [xj, yj] = BREAD_OUT[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const edge = (px: number, py: number) => { let d = 1e9, bite = false; for (let i = 0; i < BREAD_OUT.length; i++) { const a = BREAD_OUT[i], b = BREAD_OUT[(i + 1) % BREAD_OUT.length]; const r = segDist(px, py, a[0], a[1], b[0], b[1]); if (r.d < d) { d = r.d; bite = i >= 1 && i <= 6; } } return { d, bite }; };
  const CRUMB = ['#d8c49a', '#ead8b0', '#f6e8c8', '#fff6e2'];
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const [px, py] = toT(x, y);
    const e = edge(px, py), dpx = e.d / (0.36 / 48);
    let c: string;
    if (!inside(px, py)) c = e.bite ? CRUMB[0] : '#5a2e10';
    else if (!e.bite && dpx < 1.2) c = '#6a3412';
    else if (!e.bite && dpx < 2.4) c = '#a8601e';
    else if (!e.bite && dpx < 3.4) c = '#d0a060';
    else c = e.bite && dpx < 1.4 ? CRUMB[1] : dpx < 5 ? CRUMB[1] : CRUMB[2];
    p.set(x, y, c);
  }
  // air pockets: a shadowed pocket, a lit lip above it
  for (const [hx, hy, rx, ry] of [[14, 18, 2.2, 1.4], [30, 14, 1.6, 1.2], [22, 27, 2.6, 1.6], [34, 31, 1.8, 1.2], [12, 33, 1.4, 1], [27, 37, 1.2, 0.9], [19, 11, 1.1, 0.8], [37, 22, 1.2, 0.9], [9, 25, 1, 0.8]] as [number, number, number, number][]) {
    p.ellipse(hx, hy, rx, ry, (nx, ny) => hex(ny < -0.2 ? CRUMB[0] : '#b89a6a'));
    p.set(Math.round(hx), Math.round(hy - ry) - 1, CRUMB[3]);
    p.set(Math.round(hx) + 1, Math.round(hy - ry) - 1, CRUMB[3]);
  }
  // torn fibres along the bite
  for (const [tx, ty] of [[36, 42], [38, 41], [40, 40], [42, 38]] as [number, number][]) p.set(tx, ty, CRUMB[3]);
});
/** the crust round the sides (repeating): baked brown with darker blisters and a floury streak */
const crustTex = () => ctex('story.crust2', 16, 16, (p) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, (x * 3 + y * 7) % 11 === 0 ? '#5a2e10' : y % 8 === 3 ? '#b87030' : (x + y) % 5 === 0 ? '#7a4016' : '#94521e');
  for (const [x, y] of [[3, 10], [11, 4], [8, 13]] as [number, number][]) { p.set(x, y, '#e0c8a0'); p.set(x + 1, y, '#c8a878'); }
});
export function buildBread(): { group: THREE.Group; bread: THREE.Group } {
  const group = new THREE.Group();
  const bread = new THREE.Group();
  // the slice: the outline extruded with a rounded crust edge, crumb on the faces, crust round the sides
  const sh = new THREE.Shape(BREAD_OUT.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 1, curveSegments: 1 });
  g.translate(0, 0, -0.025);
  const uv = g.attributes.uv as THREE.BufferAttribute, pos = g.attributes.position as THREE.BufferAttribute;
  // faces (group 0): the crumb page, projected flat; sides (group 1): the crust, wrapped by position
  const g0 = g.groups[0];
  for (let i = 0; i < uv.count; i++) {
    const onFace = i >= g0.start && i < g0.start + g0.count;
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (onFace) uv.setXY(i, (x + 0.18) / 0.36, (y + 0.19) / 0.38);
    else uv.setXY(i, (x + y) * 4, z * 6);
  }
  const slice = new THREE.Mesh(g.index ? g.toNonIndexed() : g, [psxMat(crumbTex(), { rough: 0.95 }), psxMat(crustTex(), { rough: 0.9 })]);
  slice.castShadow = true;
  bread.add(slice);
  const hook = buildHook();
  hook.position.set(0, 0.2, 0);
  hook.rotation.z = Math.PI;
  bread.add(hook);
  bread.position.y = -0.22;
  group.add(bread);
  return { group, bread };
}

// ------------------------------------------------------------------ glass bottles (human trash) to smash
export type BottleKind = 'beer' | 'jar' | 'soda';
const BOTTLE: Record<BottleKind, { glass: string; tint: string; shard: string; h: number; r: number; lean: number }> = {
  beer: { glass: '#6a3a14', tint: '#b8742e', shard: '#c88a3a', h: 2.1, r: 0.32, lean: 0.3 },
  jar: { glass: '#7aa89a', tint: '#d8f0e4', shard: '#c8f0e0', h: 1.3, r: 0.48, lean: -0.08 },
  soda: { glass: '#5aa89a', tint: '#bff0e0', shard: '#9ae8d8', h: 1.85, r: 0.3, lean: -0.2 },
};
/** the glass silhouettes (lathe profiles, [r, y] bottom up, in units of the bottle's R and H) */
const BOTTLE_PROF: Record<BottleKind, Prof> = {
  beer: [[0, 0], [0.9, 0], [1, 0.04], [1, 0.55], [0.95, 0.62], [0.62, 0.69], [0.42, 0.74], [0.32, 0.8], [0.3, 0.93], [0.36, 0.945], [0.36, 0.975], [0.28, 0.985], [0, 0.985]],
  jar: [[0, 0], [0.9, 0], [1, 0.05], [1, 0.78], [0.94, 0.84], [0.84, 0.86], [0.84, 0.885], [0.89, 0.895], [0.89, 0.915], [0.84, 0.925], [0.84, 0.96], [0, 0.96]],
  soda: [[0, 0], [0.88, 0], [1, 0.08], [0.86, 0.2], [1, 0.32], [0.98, 0.42], [0.9, 0.5], [0.66, 0.62], [0.45, 0.72], [0.31, 0.84], [0.29, 0.94], [0.34, 0.955], [0.34, 0.975], [0, 0.98]],
};
const bottleProf = (k: BottleKind): Prof => { const g = BOTTLE[k]; return BOTTLE_PROF[k].map(([r, y]) => [r * g.r, y * g.h]); };
/**
 * the glass (u round from the front, v down from the lip): see-through tinted glass that goes darker and thicker where
 * it turns away (the silhouette sides), a long painted highlight on the front-left and a short one on the right,
 * a thicker shoulder band, and the bottom crusted where it sits in the sand: sand grit, a ragged line of green algae
 * and a few barnacles. The soda bottle gets its vertical flutes, the jar its screw threads.
 */
const glassTex = (k: BottleKind) => ctex('story.glass2.' + k, 32, 64, (p) => {
  const g = BOTTLE[k], prof = BOTTLE_PROF[k];
  const vs = profV(prof);
  const rowOf = (yFrac: number) => { let i = 0; while (i < prof.length - 1 && prof[i + 1][1] < yFrac) i++; const t = (yFrac - prof[i][1]) / Math.max(1e-6, prof[i + 1][1] - prof[i][1]); return Math.round((1 - (vs[i] + (vs[i + 1] - vs[i]) * Math.min(1, Math.max(0, t)))) * 63); };
  const neck = rowOf(k === 'jar' ? 0.84 : k === 'beer' ? 0.66 : 0.6), base = rowOf(0.1), crust = rowOf(0.05);
  const glass = g.glass, dark = '#' + [1, 3, 5].map((i) => Math.round(parseInt(glass.slice(i, i + 2), 16) * 0.55).toString(16).padStart(2, '0')).join('');
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    const side = Math.abs(((x + 0.5) / 32) - 0.25) < 0.05 || Math.abs(((x + 0.5) / 32) - 0.75) < 0.05;
    let c = glass, a = k === 'jar' ? 110 : k === 'soda' ? 135 : 150;
    if (side) { c = dark; a = 205; }
    if (y <= neck && y >= neck - 3) { c = dark; a = 190; }
    if (k === 'soda' && y > rowOf(0.5) && y < rowOf(0.12) && x % 4 === 0) { c = g.tint; a = 170; }
    if (k === 'jar' && y < rowOf(0.84) && (y % 3) === 0) { c = g.tint; a = 200; }
    p.set(x, y, c, a);
  }
  // the highlights: a long one front-left, a short broken one on the right
  for (let y = 2; y < base - 2; y++) { if (y === neck - 1 || y === neck) continue; p.set(3, y, '#ffffff', 225); p.set(4, y, g.tint, 200); }
  for (let y = neck + 6; y < base - 8; y++) if (y % 9 < 6) p.set(28, y, g.tint, 170);
  for (let x = 0; x < 32; x++) p.set(x, 0, g.tint, 230);
  // the crusted foot: grit, a ragged algae line above it, barnacles
  for (let x = 0; x < 32; x++) {
    const top = crust - 2 - ((x * 7) % 5 === 0 ? 2 : (x * 3) % 4 === 0 ? 1 : 0);
    for (let y = top; y < 64; y++) p.set(x, y, y >= crust + 1 ? (((x + y) % 5) ? '#c8b088' : '#a08a64') : (((x + y) & 1) ? '#4e7a2a' : '#6a9a34'));
    p.set(x, top - 1, '#3a5a1e', 230);
  }
  for (const [bx, by] of [[6, base], [9, base + 2], [21, base + 1], [26, base - 1]] as [number, number][]) {
    p.set(bx, by, '#e8e4d8'); p.set(bx + 1, by, '#c8c4b8'); p.set(bx, by + 1, '#a8a498'); p.set(bx + 1, by + 1, '#3a3a34');
  }
});
/**
 * labels + neck foil, one page: a wet, peeling beer label (cream paper with a gold border, a red oval with an
 * anchor, a ribbon and print lines, water stains, the top right corner curling off), a gold neck foil with a red
 * stripe, and the soda's red label with a white wave.
 */
const labelTex = () => ctex('story.label2', 32, 32, (p) => {
  const PAPER = ['#b8a47a', '#d8c69c', '#ece0bc', '#f6eed4'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, PAPER[y < 2 || y > 13 ? 1 : 2]);
  rect(p, 0, 1, 32, 1, '#a07a2a'); rect(p, 0, 14, 32, 1, '#a07a2a');
  // the oval badge with an anchor
  p.ellipse(16, 7.5, 6, 5.5, '#7a1a14'); p.ellipse(16, 7.5, 5, 4.5, '#c83a2a'); p.ellipse(16, 7.5, 3.6, 3.2, PAPER[3]);
  rect(p, 15, 5, 2, 6, '#2a1a10'); rect(p, 13, 6, 6, 1, '#2a1a10'); p.set(13, 10, '#2a1a10'); p.set(14, 11, '#2a1a10'); rect(p, 15, 11, 2, 1, '#2a1a10'); p.set(17, 11, '#2a1a10'); p.set(18, 10, '#2a1a10');
  p.set(16, 4, '#2a1a10');
  // print lines either side (the brand, the small print)
  for (let x = 2; x < 9; x++) { if (x % 3) p.set(x, 6, '#5a3a24'); p.set(x, 9, '#8a6a4a'); }
  for (let x = 23; x < 30; x++) { if (x % 3) p.set(x, 6, '#5a3a24'); p.set(x, 9, '#8a6a4a'); }
  // water stains (soft brown tide marks)
  for (const [sx, sy, r] of [[5, 12, 2.5], [26, 3, 2], [9, 3, 1.5]] as [number, number, number][]) p.ellipse(sx, sy, r, r * 0.7, (nx, ny) => (nx * nx + ny * ny > 0.55 ? hex('#a8946a') : null));
  // the peeling corner: cut away, the curl shaded
  for (let y = 0; y < 5; y++) for (let x = 27 + y; x < 32; x++) p.set(x, y, '#000000', 0);
  for (let y = 0; y < 5; y++) { p.set(26 + y, y, PAPER[0]); p.set(25 + y, y, PAPER[3]); }
  // neck foil (rows 16-23): gold leaf, crinkled, a red stripe
  const GOLD = T.gold;
  for (let y = 16; y < 24; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(GOLD, y === 16 ? 4 : ((x * 5 + y * 3) % 7 === 0 ? 2 : 3)));
  rect(p, 0, 19, 32, 2, '#a81c24'); for (let x = 0; x < 32; x += 4) p.set(x, 19, '#f86a4a');
  // soda label (rows 24-31): red with a white wave and dark edges
  for (let y = 24; y < 32; y++) for (let x = 0; x < 32; x++) {
    const wv = 27.5 + Math.round(Math.sin(x / 32 * TAU * 2) * 1.5);
    p.set(x, y, y === 24 || y === 31 ? '#6e0e1a' : Math.abs(y - wv) < 1 ? '#fff6ec' : y - wv === 1 ? '#e8d8d0' : '#c8281e');
  }
});
/** caps, lid, the pickle and the sand: crimped gold and red crown caps, a rusty tin lid with a printed ring, a warty
 *  gherkin, and the sand the bottles sit in (ripples, a shell bit) */
const bitsTex = () => ctex('story.bottlebits', 32, 48, (p) => {
  for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) p.set(x, y, tone(T.gold, y < 2 ? 4 : x % 2 ? 2 : 3));
  for (let x = 0; x < 32; x += 2) p.set(x, 7, tone(T.gold, 0));
  for (let y = 8; y < 16; y++) for (let x = 0; x < 32; x++) p.set(x, y, y < 10 ? '#f4f0e8' : x % 2 ? '#8a1414' : '#c8281e');
  for (let y = 16; y < 24; y++) for (let x = 0; x < 32; x++) {
    const rust = (x * 7 + y * 3) % 11 === 0 || (x > 20 && x < 24 && y > 19);
    p.set(x, y, rust ? '#8a4a1a' : y === 16 ? '#e8d8a8' : y < 19 ? '#c8a860' : x % 2 ? '#7a6a48' : '#a08a5a');
  }
  rect(p, 0, 17, 32, 1, '#a81c24');
  // gherkin (rows 24-39, cols 0-15): dark green with pale stripes and warts
  for (let y = 24; y < 40; y++) for (let x = 0; x < 16; x++) {
    let c = x % 4 === 1 ? '#6a8a2a' : (x % 4 === 3 ? '#2a4a10' : '#3e6018');
    if ((x * 3 + y * 5) % 7 === 0) c = '#a8c060';
    if (y === 24 || y === 39) c = '#5a6a20';
    p.set(x, y, c);
  }
  // a dill frond (cols 16-31): stalk with feathery leaves, the rest cut away
  for (let y = 24; y < 40; y++) { p.set(23, y, '#4a6a1a'); if (y % 2 === 0) for (let k = 1; k < 4; k++) { p.set(23 - k, y - k * 0.5, '#6a9a2a'); p.set(23 + k, y - k * 0.5, '#5a8a24'); } }
  // sand (rows 40-47): ripples, grit, a pink shell fleck
  for (let y = 40; y < 48; y++) for (let x = 0; x < 32; x++) p.set(x, y, (y + Math.round(Math.sin(x * 0.6) * 1.2)) % 3 === 0 ? '#a8926c' : ((x * 5 + y) % 9 === 0 ? '#e0cca0' : '#c8b28a'));
  p.set(7, 44, '#f0a8a0'); p.set(8, 44, '#e88a8a'); p.set(19, 46, '#f4eee0');
});
const crackTex = () => ctex('story.crack', 32, 32, (p) => {
  // a starburst of hairline cracks (white with a dark edge), the rest see-through
  const lines: [number, number, number][] = [[0.2, 14, 0], [1.4, 12, 1], [2.6, 15, 2], [3.7, 11, 3], [4.9, 13, 4], [5.8, 9, 5]];
  for (const [a, len, sd] of lines) {
    let x = 16, y = 16, aa = a;
    for (let i = 0; i < len; i++) { aa += (((i * 7 + sd * 13) % 5) - 2) * 0.12; x += Math.cos(aa); y += Math.sin(aa); p.set(Math.round(x), Math.round(y), '#ffffff'); p.set(Math.round(x) + 1, Math.round(y), '#3a4a48'); }
  }
  p.ellipse(16, 16, 2, 2, '#ffffff');
});

/** a giant glass bottle stuck in the sand: the first hit cracks it (clink), the second shatters it into shards */
export class GlassBottle implements Entity {
  kind = 'bottle'; team: Team = 'enemy';
  x: number; y: number; vx = 0; vy = 0; r: number; alive = true;
  hp = 2; maxHp = 2;
  obj = new THREE.Group();
  private body = new THREE.Group();
  private crack: THREE.Mesh;
  private wob = 0; private wobV = 0; private flash = 0;
  onBreak?: (b: GlassBottle) => void;
  constructor(public type: BottleKind, x: number, floor: number) {
    const g = BOTTLE[type];
    this.x = x; this.y = floor + g.h * 0.45; this.r = g.r + 0.32;
    // matte glass (v7): the shine is painted into the page, no specular glint
    const glass = uw(new THREE.MeshStandardMaterial({ map: glassTex(type), transparent: true, roughness: 0.6, metalness: 0, emissive: g.tint, emissiveIntensity: 0.1, side: THREE.DoubleSide }), { rim: 0.3, rimCol: [0.8, 1, 1], caustics: 0.6 });
    const H = g.h, R = g.r, prof = bottleProf(type);
    const bodyM = new THREE.Mesh(lathe(prof, 10, [32, 64], [0, 0, 32, 64]), glass);
    bodyM.castShadow = true; bodyM.renderOrder = 2;
    this.body.add(bodyM);
    const BP: [number, number] = [32, 48], LP: [number, number] = [32, 32];
    const bits = psxMat(bitsTex(), { rough: 0.7, metal: 0.2 }), label = sheetMat(labelTex(), { rough: 0.9 });
    const crown = (r0: number, y0: number, row: number) => lathe([[r0 * 1.04, y0 - H * 0.012], [r0 * 1.05, y0 + H * 0.02], [r0 * 0.92, y0 + H * 0.032], [0, y0 + H * 0.035]], 18, BP, [0, row, 32, 8], { rmod: (i, j) => (i < 2 && j % 2 ? 1.12 : 1) });
    if (type === 'beer') {
      this.body.add(propMesh([lathe([[R * 1.02, H * 0.18], [R * 1.025, H * 0.33], [R * 1.02, H * 0.46]], 10, LP, [0, 0, 32, 16], { arc: 0.42 })], label));
      this.body.add(propMesh([lathe([[R * 0.335, H * 0.8], [R * 0.32, H * 0.86], [R * 0.31, H * 0.93]], 10, LP, [0, 16, 32, 8])], label));
      this.body.add(propMesh([crown(R * 0.38, H * 0.975, 0)], bits));
    } else if (type === 'jar') {
      // the tin lid, knurled round its rim, knocked askew
      const lid = propMesh([lathe([[R * 0.9, H * 0.9], [R * 0.93, H * 0.91], [R * 0.93, H * 0.99], [R * 0.86, H * 1.0], [0, H * 1.005]], 14, BP, [0, 16, 32, 8], { rmod: (i, j) => (i > 0 && i < 3 && j % 2 ? 1.04 : 1) })], bits);
      lid.rotation.z = 0.08; lid.position.x = 0.02;
      // two gherkins and a dill frond floating in the old brine
      const gherkin = (len: number, rr: number) => lathe([[0, -len / 2], [rr * 0.55, -len * 0.42], [rr * 0.95, -len * 0.25], [rr, 0], [rr * 0.95, len * 0.25], [rr * 0.6, len * 0.42], [0, len / 2]], 7, BP, [0, 24, 16, 16], { rmod: (i, j) => 1 + ((i + j) % 2) * 0.1 });
      const pickles = propMesh([
        xf(gherkin(H * 0.5, R * 0.26), [0.05, H * 0.4, 0.02], [0, 0, 0.5]),
        xf(gherkin(H * 0.42, R * 0.22), [-R * 0.38, H * 0.33, -0.08], [0.3, 0, -0.35]),
      ], bits);
      const dill = new THREE.Mesh(strip([{ c: [R * 0.3, H * 0.18, -0.05], w: [0.07, 0, 0] }, { c: [R * 0.38, H * 0.45, -0.04], w: [0.09, 0, 0] }, { c: [R * 0.25, H * 0.7, -0.03], w: [0.07, 0, 0] }], BP, [16, 24, 16, 16]), sheetMat(bitsTex()));
      this.body.add(lid, pickles, dill);
    } else {
      this.body.add(propMesh([lathe([[R * 0.99, H * 0.3], [R * 1.005, H * 0.37], [R * 0.99, H * 0.44]], 10, LP, [0, 24, 32, 8])], label));
      this.body.add(propMesh([crown(R * 0.36, H * 0.975, 8)], bits));
    }
    // half sunk in the sand: a collar of sand heaped round the foot (stays put while the bottle wobbles)
    const sand = propMesh([lathe([[R * 1.8, -0.1], [R * 1.4, 0.03], [R * 1.12, 0.11], [R * 1.0, 0.15]], 9, BP, [0, 40, 32, 8])], psxMat(bitsTex(), { rough: 0.95 }), false);
    sand.receiveShadow = true;
    this.obj.add(sand);
    // the crack decal: a starburst on the camera side, shown after the first hit
    this.crack = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.2, R * 2.2), new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, alphaTest: 0.5, depthWrite: false }));
    this.crack.position.set(0, H * (type === 'jar' ? 0.5 : 0.35), R * 1.04);
    this.crack.visible = false;
    this.body.add(this.crack);
    this.body.rotation.z = g.lean;
    this.obj.add(this.body);
    // a little in front of the gameplay plane so the seagrass doesn't swallow them
    this.obj.position.set(x, floor - 0.12, 0.45);
  }
  update(dt: number) {
    this.wobV += (-this.wob * 160 - this.wobV * 6) * dt;
    this.wob += this.wobV * dt;
    this.body.rotation.z = BOTTLE[this.type].lean + this.wob;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.body.scale.set(1 + this.flash * 0.05, 1 - this.flash * 0.04, 1 + this.flash * 0.05);
  }
  hit(_dmg: number, dx: number, _dy: number, w: World): boolean {
    if (!this.alive) return false;
    this.hp -= 1;
    this.wobV += -Math.sign(dx || 1) * 3.5;
    this.flash = 1;
    const g = BOTTLE[this.type];
    w.fx.burst('spark', this.x, this.y + 0.2, 5, 2.5, { color: '#ffffff' });
    w.fx.debrisBurst(this.x, this.y + 0.2, 3, g.shard, 2, 0.04);
    w.sfx('k_glass', this.x, 0.75, 1.1 + Math.random() * 0.25);
    if (this.hp <= 0) this.shatter(w);
    else { this.crack.visible = true; w.sfx('ice', this.x, 0.4, 1.6); }
    return true;
  }
  private shatter(w: World) {
    this.alive = false;
    const g = BOTTLE[this.type];
    // shards everywhere: glass-coloured chunks, white glints, a spray of bubbles, sand where they land
    w.fx.debrisBurst(this.x, this.y, 22, g.shard, 5, 0.07);
    w.fx.debrisBurst(this.x, this.y + 0.3, 10, '#f4fff8', 4, 0.04);
    w.fx.burst('spark', this.x, this.y, 14, 4.5, { color: '#ffffff' });
    w.fx.emit('star', this.x, this.y + 0.2, { n: 6, speed: 3, life: 0.6, size: 0.2 });
    w.fx.emit('bubbleBig', this.x, this.y, { n: 12, spread: 0.6, speed: 2 });
    w.sfx('k_glass3', this.x, 0.9, 1.0); w.sfx('k_glass4', this.x, 0.8, 1.2); w.sfx('ice_big', this.x, 0.55, 1.3);
    w.game.addShake(0.12); w.game.freeze(0.05);
    this.onBreak?.(this);
  }
  dispose() { this.obj.removeFromParent(); }
}

// ------------------------------------------------------------------ Mr. Crab's training shell
/** a textile cone shell (Conus): a long body tapering to the front tip, a sharp shoulder, a low stepped spire */
const CONE_PROF: Prof = [[0, -0.155], [0.018, -0.148], [0.044, -0.1], [0.07, -0.035], [0.093, 0.03], [0.107, 0.068], [0.104, 0.08],
  [0.082, 0.087], [0.075, 0.099], [0.056, 0.105], [0.05, 0.117], [0.033, 0.123], [0.027, 0.133], [0.013, 0.139], [0, 0.147]];
const coneTex = () => ctex('story.cone2', 32, 48, (p) => {
  const vs = profV(CONE_PROF), sh = 1 - vs[5];
  const BODY = ['#5a2a0c', '#8a4614', '#b8702a', '#d89a48'], CREAM = ['#e8d4b0', '#f8ecd4', '#fffaf0'];
  for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
    const v = y / 47;
    let c: string;
    if (v < sh - 0.005) {
      // the spire: cream whorls, each with a brown flame blotch and a dark suture line
      const w = Math.floor(v / (sh / 4));
      const inW = (v % (sh / 4)) / (sh / 4);
      c = inW > 0.82 ? BODY[0] : ((x + w * 5) % 8) < 3 ? BODY[2] : CREAM[1];
      if (y === 0) c = BODY[1];
    } else {
      // the body: golden brown with white "tents" (rows of little triangles), dark spiral lines between the rows
      const k = (v - sh) / (1 - sh), row = Math.floor(k * 9), ly = (k * 9) % 1;
      const cx = ((x + (row % 2) * 4) % 8) - 3.5;
      const tent = ly > 0.15 && Math.abs(cx) < (ly - 0.15) * 4.2;
      c = tent ? (Math.abs(cx) < (ly - 0.15) * 2 ? CREAM[2] : CREAM[0]) : ly < 0.15 ? BODY[0] : row % 3 === 1 ? BODY[1] : BODY[2];
      // the shoulder ridge catches the light
      if (Math.abs(v - sh) < 0.025) c = CREAM[1];
      // the narrow aperture down the back (u ~ 0.5), pink inside a dark lip
      if (x === 15 || x === 17) c = BODY[0];
      if (x === 16) c = '#f0c8c0';
      // the front tip, worn pale
      if (k > 0.93) c = x % 3 ? CREAM[0] : BODY[3];
    }
    p.set(x, y, c);
  }
});
/**
 * a cone shell Mr. Crab lobs at the kid: it homes in slowly, FLASHES just before it arrives (the parry cue) and is
 * resolved by the combat resolver (attackPlayer), so a parry, a block, a dodge or a hit all behave like the real
 * thing. onResolve reports the outcome; a parried shell flies back to the thrower.
 */
export class ShellShot implements Entity {
  kind = 'shellShot'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 0.2; alive = true;
  obj = new THREE.Group();
  private mesh: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private t = 0;
  private flashed = false;
  private state: 'in' | 'back' | 'loose' = 'in';
  private looseT = 0;
  onFlash?: () => void;
  onResolve?: (res: string) => void;
  constructor(x: number, y: number, private home: () => { x: number; y: number }, private speed = 2.3, private cue: (w: World, s: ShellShot) => void = () => {}) {
    this.x = x; this.y = y;
    this.mat = psxMat(coneTex(), { rough: 0.7, emissive: '#ffffff', emissiveK: 0 });
    this.mesh = new THREE.Mesh(lathe(CONE_PROF, 10, [32, 48], [0, 0, 32, 48]), this.mat);
    this.mesh.castShadow = true;
    this.obj.add(this.mesh);
  }
  update(dt: number, w: World) {
    this.t += dt;
    const p = w.player;
    if (this.state === 'in') {
      const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy) || 1;
      // a lazy homing lob: steer toward the kid, a little arc on the way
      const want = this.speed;
      this.vx += ((dx / d) * want - this.vx) * Math.min(1, dt * 3);
      this.vy += ((dy / d) * want - this.vy) * Math.min(1, dt * 3) + Math.sin(this.t * 3) * dt * 0.6;
      // the tell comes ~0.32 s before contact (like the real enemies' glints, a touch more generous for a lesson)
      if (!this.flashed && (d - (p.r + 0.3)) / want < 0.32) { this.flashed = true; this.cue(w, this); this.onFlash?.(); }
      if (d < p.r + 0.3) this.resolve(w);
    } else if (this.state === 'back') {
      const h = this.home(), dx = h.x - this.x, dy = h.y - this.y, d = Math.hypot(dx, dy) || 1;
      this.vx = (dx / d) * 7; this.vy = (dy / d) * 7;
      if (d < 0.4) { this.alive = false; w.sfx('clank', this.x, 0.6, 1.5); w.fx.burst('spark', this.x, this.y, 8, 3); }
    } else {
      this.looseT += dt;
      this.vy -= 3 * dt;
      if (this.looseT > 1.4) this.alive = false;
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.obj.position.set(this.x, this.y, 0.25);
    this.mesh.rotation.set(this.t * 7, 0, this.t * 11);
    this.mat.emissiveIntensity = this.flashed && this.state === 'in' ? 0.6 + Math.sin(this.t * 40) * 0.4 : 0;
    this.obj.scale.setScalar(this.state === 'loose' ? Math.max(0.01, 1 - this.looseT / 1.4) : 1);
  }
  private resolve(w: World) {
    const res = attackPlayer(w, { src: null, dmg: 1, x: this.x, y: this.y, kind: 'crush', projectile: this, knock: 3, name: 'a training shell', guardDmg: 10 });
    if (res === 'parried') this.state = 'back';
    else if (res === 'hit') { this.alive = false; w.fx.debrisBurst(this.x, this.y, 6, '#f0d8b8', 2.5, 0.04); w.sfx('crunch', this.x, 0.6, 1.3); }
    else { this.state = 'loose'; this.vx *= -0.5; this.vy = 2; if (res === 'blocked') w.sfx('clank', this.x, 0.6, 1.3); }
    this.onResolve?.(res);
  }
  /** the resolver deflects a parried projectile: home to the thrower */
  deflect() { this.state = 'back'; }
  dispose() { this.obj.removeFromParent(); }
}

// ------------------------------------------------------------------ the ruined home (the tutorial ends at its door)
const stoneTex = () => ctex('story.stone', 64, 64, (p) => {
  const S = ['#2a3036', '#3c444c', '#4e5862', '#626c76', '#7a8590', '#96a0aa'];
  rect(p, 0, 0, 64, 64, S[0]);
  // running-bond blocks, each its own tone, a lit top edge and a mortar shadow
  for (let row = 0; row < 7; row++) {
    const y0 = row * 9 + 1, off = (row % 2) * 9;
    for (let x0 = -off; x0 < 64; x0 += 18) {
      const t = 2 + ((row * 3 + Math.floor((x0 + 18) / 18)) % 3);
      rect(p, Math.max(0, x0 + 1), y0, Math.min(16, 64 - Math.max(0, x0 + 1)), 7, S[t]);
      rect(p, Math.max(0, x0 + 1), y0, Math.min(16, 64 - Math.max(0, x0 + 1)), 1, S[t + 1]);
      if (x0 + 16 < 64 && x0 + 16 >= 0) rect(p, x0 + 16, y0, 1, 7, S[1]);
    }
  }
  // cracks and moss creeping up from the bottom
  for (const [x0, y0, len] of [[12, 10, 14], [44, 30, 12], [28, 46, 10]] as [number, number, number][]) for (let i = 0; i < len; i++) p.set(x0 + Math.round(Math.sin(i * 0.9) * 1.5), y0 + i, '#14181c');
  for (let x = 0; x < 64; x++) { const h = 5 + Math.round((Math.sin(x * 0.35) + 1) * 3 + ((x * 7) % 5)); for (let y = 64 - h; y < 64; y++) p.set(x, y, y > 64 - h * 0.5 ? '#2e4a22' : '#466a2c'); p.set(x, 63 - h, '#6a8a3a'); }
});
const boardTex = () => ctex('story.board', 32, 32, (p) => planks(p, 0, 0, 32, 32, T.drift, { plank: 8, seed: 21, vertical: true }));

/** a small abandoned stone house: a broken roof, a door hanging off one hinge, an empty window, rubble and kelp */
export class RuinedHome {
  group = new THREE.Group();
  /** where the kid swims in (local, the doorway's middle) */
  door = new THREE.Vector3(-0.55, 1.0, 1.55);
  private hangDoor: THREE.Object3D;
  private kelp: { m: THREE.Mesh; ph: number }[] = [];
  private t = 0;
  constructor() {
    const g = this.group;
    const stone = psxMat(stoneTex(), { rough: 0.9 }), board = psxMat(boardTex(), { rough: 0.85 }), dark = flat('#06080c', { rough: 1 });
    const W = 4.4, H = 3.0, D = 3.0;
    /** a wall that has broken off: its top follows the (u 0..1 along, height as a fraction of H) points */
    const brokenWall = (len: number, h: number, top: [number, number][], x: number, z0: number, rz: number) => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(len, 0);
      for (let i = top.length - 1; i >= 0; i--) sh.lineTo(top[i][0] * len, top[i][1] * h);
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false });
      geo.translate(0, 0, -0.175);
      geo.rotateY(-Math.PI / 2);
      const me = M(boxUV(geo.index ? geo.toNonIndexed() : geo, 1.2), stone);
      me.position.set(x, 0, z0); me.rotation.z = rz;
      g.add(me);
    };
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, rz = 0) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * 0.6, uv.getY(i) * dims[f][1] * 0.6); }
      const me = M(geo, m); me.position.set(x, y, z); me.rotation.z = rz; g.add(me); return me;
    };
    // walls: back, a full left side, a broken-down right side, the front with a doorway and a window hole
    box(W, H, 0.35, 0, H / 2, -D / 2, stone);
    box(0.35, H, D, -W / 2, H / 2, 0, stone);
    // the right wall has fallen in: what stands is broken off in a jagged line, blocks knocked loose along the break
    brokenWall(D * 0.7, H, [[0, 0.62], [0.12, 0.58], [0.22, 0.66], [0.35, 0.5], [0.48, 0.55], [0.6, 0.38], [0.74, 0.44], [0.86, 0.3], [1, 0.34]], W / 2, -D * 0.15 - D * 0.35, 0);
    brokenWall(D * 0.3, H, [[0, 0.34], [0.3, 0.3], [0.55, 0.22], [0.8, 0.27], [1, 0.18]], W / 2, D * 0.35 - D * 0.15, 0.08);
    box(1.0, H, 0.35, -W / 2 + 0.5, H / 2, D / 2, stone);                     // left of the door
    box(W - 2.1, H * 0.42, 0.35, W / 2 - (W - 2.1) / 2, H * 0.21, D / 2, stone); // under the window
    box(W - 2.1, H * 0.22, 0.35, W / 2 - (W - 2.1) / 2, H * 0.89, D / 2, stone); // over the window
    box(0.45, H * 0.36, 0.35, W / 2 - 0.22, H * 0.6, D / 2, stone);           // window jamb
    box(1.3, 0.4, 0.4, -0.55, H - 0.2, D / 2, stone);                          // the lintel over the door
    // dark inside (seen through the doorway and the window)
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, H - 0.2), dark); inside.position.set(0, H / 2, -D / 2 + 0.2); g.add(inside);
    // the roof: slanted boards with gaps, one fallen and leaning on the wall
    for (let i = 0; i < 7; i++) {
      if (i === 2 || i === 5) continue;
      const b = box(0.5, 0.08, D + 0.6, -W / 2 + 0.3 + i * 0.62, H + 0.25 - Math.abs(i - 3) * 0.09, 0, board);
      b.rotation.x = 0.05; b.rotation.z = (i - 3) * 0.04;
    }
    const fallen = box(0.5, 0.08, 2.4, W / 2 + 0.55, 1.1, 0.6, board); fallen.rotation.set(0.9, 0.2, 0.3);
    // the door, hanging off its top hinge
    const hinge = new THREE.Group(); hinge.position.set(-1.15, H - 0.45, D / 2 + 0.2);
    const door = new THREE.Mesh(facet(new THREE.BoxGeometry(1.0, 2.0, 0.08)), board); door.position.set(0.5, -1.0, 0); door.castShadow = true;
    hinge.add(door); hinge.rotation.set(0.15, 0.5, -0.55);
    g.add(hinge); this.hangDoor = hinge;
    // rubble at the foot of the broken wall: dressed blocks that fell out of it (chipped, tumbled) and broken chunks
    const rubble: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 6; i++) {
      const blk = jitter(new THREE.BoxGeometry(0.5, 0.3, 0.34, 1, 1, 1), 0.035, 40 + i);
      rubble.push(xf(boxUV(facet(blk), 1.2), [W / 2 + 0.35 + (i % 3) * 0.45, 0.14 + Math.floor(i / 3) * 0.26, D * 0.12 + (i % 2) * 0.42], [i * 0.4, i * 1.3, (i % 3 - 1) * 0.35]));
    }
    for (let i = 0; i < 7; i++) rubble.push(xf(lpRock(60 + i, 0.12 + (i % 3) * 0.06, 0), [W / 2 + 0.2 + (i % 4) * 0.4, 0.07, D * 0.45 + (i % 3) * 0.22 - (i > 3 ? 0.7 : 0)], [0, i * 2, 0]));
    g.add(propMesh(rubble, stone));
    // kelp: a few stalks rooted on the roof and the rubble, swaying
    const km = kelpMat();
    for (const [x, y, z, h, sd] of [[-1.6, H + 0.25, 1.0, 1.8, 3.1], [0.9, H + 0.3, -0.8, 2.3, 5.7], [1.8, H * 0.55, 0.6, 1.5, 8.2], [W / 2 + 0.9, 0.0, D * 0.5, 2.0, 2.4]] as [number, number, number, number, number][]) {
      const k = new THREE.Mesh(kelpGeo(h, sd), km);
      k.position.set(x, y, z); k.rotation.y = sd;
      g.add(k);
      this.kelp.push({ m: k, ph: sd });
    }
    g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m !== inside) { m.castShadow = true; m.receiveShadow = true; } });
  }
  update(dt: number) {
    this.t += dt;
    this.hangDoor.rotation.z = -0.55 + Math.sin(this.t * 0.9) * 0.04;
    for (const k of this.kelp) k.m.rotation.set(Math.sin(this.t * 0.9 + k.ph) * 0.06, k.ph, Math.sin(this.t * 1.1 + k.ph * 1.7) * 0.08);
  }
}

// ------------------------------------------------------------------ bubble rings (the tutorial's gates and targets)
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
/**
 * a ring of glassy bubbles (the same glass as the bubble text) round a faint glowing hoop: swim or dash through it.
 * highlight(k) makes it shimmer when it is the next one; burst() pops it (the bubbles fly apart and vanish).
 */
export class BubbleRing {
  group = new THREE.Group();
  passed = false;
  private bubbles: THREE.InstancedMesh;
  private glow: THREE.Mesh;
  private gmat: THREE.MeshBasicMaterial;
  private n: number;
  private t = Math.random() * 6;
  private pop = 0;
  private lit = 0;
  constructor(public x: number, public y: number, public r = 0.9, tint = '#bff4ff') {
    this.n = Math.round(12 + r * 9);
    this.bubbles = bubbleCluster(this.n, tint);
    this.gmat = new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    this.glow = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 4, 28), this.gmat);
    this.group.add(this.bubbles, this.glow);
    this.group.position.set(x, y, 0);
    this.group.rotation.y = 0.35;
    this.update(0);
  }
  /** did a swimmer moving from a to b this frame go through the ring's disc */
  crossed(ax: number, ay: number, bx: number, by: number, k = 0.92) { return !this.passed && segDist(this.x, this.y, ax, ay, bx, by).d < this.r * k; }
  /** 0..1: shimmer as the next target */
  highlight(k: number) { this.lit = k; }
  burst() { if (!this.passed) { this.passed = true; this.pop = 1; } }
  get gone() { return this.passed && this.pop <= 0; }
  update(dt: number) {
    this.t += dt;
    if (this.passed) this.pop = Math.max(0, this.pop - dt * 2.2);
    const t = this.t, n = this.n;
    this.group.position.y = this.y + Math.sin(t * 1.4) * 0.07;
    const blow = this.passed ? 1 - this.pop : 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.45 + Math.sin(t * 0.7 + i) * 0.05;
      const rr = this.r * (1 + Math.sin(t * 3 + i * 1.9) * 0.04 + blow * blow * 1.6);
      const big = i % 3 === 0 ? 1.35 : i % 3 === 1 ? 0.8 : 1;
      const sz = this.r * 0.105 * big * (1 + Math.sin(t * 4.2 + i * 1.7) * 0.12 + this.lit * 0.18) * (this.passed ? Math.max(0, this.pop * 1.4 - 0.1) : 1);
      _p3.set(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(t * 2 + i) * 0.04);
      _m4.compose(_p3, _q, _s3.setScalar(Math.max(1e-4, sz)));
      this.bubbles.setMatrixAt(i, _m4);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
    this.gmat.opacity = this.passed ? this.pop * 0.6 : 0.28 + this.lit * (0.35 + Math.sin(t * 7) * 0.15);
    this.glow.scale.setScalar(1 + blow * 0.6);
    this.group.visible = !this.gone;
  }
  dispose() { this.group.removeFromParent(); this.bubbles.geometry.dispose(); this.glow.geometry.dispose(); this.gmat.dispose(); }
}

// ------------------------------------------------------------------ kelp gates (the swim slalom)
/**
 * sargassum page (64 x 32): left half the raft's top (a tangle of golden-olive leaf blades with round air bladders,
 * darker gaps between), right half four hanging fronds (a stem with alternate leaves and bladder clusters; the rest
 * cut away by alpha)
 */
const weedTex = () => ctex('story.sargassum', 64, 32, (p) => {
  const L = ['#2a2a0c', '#4a4414', '#6e6420', '#94862e', '#b8a640'];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    // blades: diagonal lozenges in two directions, a lit midrib
    const a = (x + y * 0.6) % 7, b = (x * 0.7 - y + 40) % 6;
    let t = a < 1 || b < 1 ? 0 : a < 3 ? 3 : b < 3 ? 2 : 1;
    if (a > 1.6 && a < 2.2) t = 4;
    p.set(x, y, L[t]);
  }
  for (const [bx, by] of [[5, 6], [17, 3], [26, 10], [9, 19], [21, 22], [29, 27], [3, 28], [14, 13]] as [number, number][]) {
    p.ellipse(bx, by, 1.6, 1.6, '#c8a838'); p.set(bx - 1, by - 1, '#f0d870'); p.set(bx + 1, by + 1, '#5a4a14');
  }
  for (let f = 0; f < 4; f++) {
    const x0 = 32 + f * 8 + 3;
    for (let y = 0; y < 32; y++) {
      p.set(x0, y, L[1]); p.set(x0 + 1, y, L[2]);
      if (y % 5 === f % 2 * 2) for (let k = 1; k < 4; k++) { const sx = (y + f) % 10 < 5 ? -k : k + 1; p.set(x0 + sx, y + (k > 2 ? 1 : 0), L[k === 1 ? 3 : 2]); }
      if (y % 9 === 4) { p.set(x0 - 2, y, '#c8a838'); p.set(x0 + 3, y + 1, '#c8a838'); }
    }
  }
});
/** a floating raft of sargassum weed: a lumpy, ragged mat with fronds hanging under its rim */
function weedRaft(seed: number): THREE.Mesh {
  const P: [number, number] = [64, 32];
  const pos: number[] = [], uv: number[] = [];
  const N = 11, rim: [number, number, number][] = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * TAU, r = 1 + 0.22 * Math.sin(k * 2.3 + seed) + 0.12 * Math.cos(k * 4.1 + seed * 2);
    rim.push([Math.cos(a) * r * 1.05, -0.04 + 0.05 * Math.sin(k * 1.7 + seed), Math.sin(a) * r * 0.62]);
  }
  const uvOf = (x: number, z: number): [number, number] => [(0.5 + x / 2.6) * 32 / 64, 1 - (0.5 + z / 1.7)];
  const tri = (a: [number, number, number], b: [number, number, number], c: [number, number, number]) => { for (const v of [a, b, c]) { pos.push(...v); uv.push(...uvOf(v[0], v[2])); } };
  // a domed top (lumps of weed) over a lumpy underside that hangs down in tufts
  const top: [number, number, number] = [0, 0.14, 0], bot: [number, number, number] = [0, -0.22, 0];
  const under = rim.map((a, k): [number, number, number] => [a[0] * 0.6, -0.16 - 0.1 * ((k * 5 + seed) % 3) / 2, a[2] * 0.6]);
  for (let k = 0; k < N; k++) {
    const a = rim[k], b = rim[(k + 1) % N], ua = under[k], ub = under[(k + 1) % N];
    const ma: [number, number, number] = [a[0] * 0.55, 0.1 + 0.04 * Math.sin(k * 3.1), a[2] * 0.55], mb: [number, number, number] = [b[0] * 0.55, 0.1 + 0.04 * Math.sin((k + 1) * 3.1), b[2] * 0.55];
    tri(top, mb, ma); tri(ma, mb, b); tri(ma, b, a);
    tri(a, b, ub); tri(a, ub, ua); tri(bot, ua, ub);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const parts: THREE.BufferGeometry[] = [g];
  // fronds hanging from the rim (on the front half, where they are seen)
  for (let k = 0; k < N; k++) {
    const a = rim[k], len = 0.4 + ((k * 7 + seed * 3) % 5) * 0.14, f = k % 4;
    parts.push(strip([0, 1, 2, 3].map((i) => ({ c: [a[0] * 0.92 + Math.sin(i + k) * 0.04, a[1] - (i / 3) * len, a[2] * 0.92] as [number, number, number], w: [0.07, 0, 0] as [number, number, number] })), P, [32 + f * 8, 0, 8, 32]));
  }
  const m = new THREE.Mesh(merge(parts), sheetMat(weedTex(), { rough: 0.9 }));
  m.castShadow = false; m.receiveShadow = true;
  return m;
}

/**
 * a slalom gate: a clump of kelp up from the seabed and a mat of kelp hanging from the surface, with a gap between
 * them (a bubble ring marks it). The kelp is soft: push() nudges a swimmer that brushes it toward the gap, so the
 * gate guides more than it blocks.
 */
export class KelpGate {
  group = new THREE.Group();
  ring: BubbleRing;
  passed = false;
  private stalks: { m: THREE.Mesh; ph: number; base: number }[] = [];
  private wob = 0; private wobV = 0;
  constructor(public x: number, floorY: number, public gapY: number, public gapH = 2.8, top = -0.25, seed = 1) {
    const km = kelpMat();
    const lo = gapY - gapH / 2, hi = gapY + gapH / 2;
    const add = (h: number, px: number, py: number, pz: number, down: boolean, sd: number) => {
      if (h < 0.5) return;
      const m = new THREE.Mesh(kelpGeo(h, sd), km);
      m.position.set(px, py, pz);
      if (down) m.rotation.z = Math.PI;
      m.rotation.y = sd * 1.3;
      // (beefier than background kelp: these stalks are the gate's walls)
      m.scale.set(1.7, 1, 1.7);
      m.castShadow = false;
      this.group.add(m);
      this.stalks.push({ m, ph: sd, base: m.rotation.z });
    };
    // up from the sand (three stalks, a little apart in depth), down from the surface mat
    add(lo - floorY + 0.15, -0.18, floorY - 0.1, -0.5, false, seed);
    add(lo - floorY - 0.25, 0.22, floorY - 0.1, -0.95, false, seed + 1.3);
    add(lo - floorY - 0.6, 0.05, floorY - 0.1, 0.15, false, seed + 2.1);
    add(top - hi + 0.15, 0.15, top, -0.55, true, seed + 3.7);
    add(top - hi - 0.3, -0.25, top, -1.0, true, seed + 4.4);
    add(top - hi - 0.7, 0.0, top, 0.1, true, seed + 5.9);
    // a floating raft of sargassum at the surface the hanging kelp drifts from
    const raft = weedRaft(seed);
    raft.position.set(0, top + 0.02, -0.4);
    this.group.add(raft);
    this.group.position.x = x;
    this.ring = new BubbleRing(x, gapY, Math.min(1.05, gapH * 0.34), '#c8ffe8');
  }
  /** soft kelp: a nudge toward the gap for a swimmer at (px, py) brushing a stalk (and a sway on the kelp) */
  push(px: number, py: number): { x: number; y: number } {
    const dx = px - this.x;
    if (Math.abs(dx) > 0.75) return { x: 0, y: 0 };
    const lo = this.gapY - this.gapH / 2 + 0.25, hi = this.gapY + this.gapH / 2 - 0.25;
    const k = 1 - Math.abs(dx) / 0.75;
    if (py < lo) { this.wobV += 0.6; return { x: 0, y: (lo - py + 0.3) * 18 * k }; }
    if (py > hi) { this.wobV -= 0.6; return { x: 0, y: -(py - hi + 0.3) * 18 * k }; }
    return { x: 0, y: 0 };
  }
  update(dt: number, time: number) {
    KELP_T.value = time;
    this.wobV += (-this.wob * 30 - this.wobV * 3) * dt; this.wob += this.wobV * dt;
    for (const s of this.stalks) s.m.rotation.z = s.base + Math.sin(time * 0.8 + s.ph) * 0.04 + this.wob * 0.1;
    this.ring.update(dt);
  }
  addTo(scene: THREE.Object3D) { scene.add(this.group, this.ring.group); }
  dispose() { this.group.removeFromParent(); this.ring.dispose(); }
}

// ------------------------------------------------------------------ a current to ride
/** a wisp of fast water (32 x 4, head at the right): a bright core, a soft edge row, a broken thinning tail */
const streakTex = () => ctex('story.streak', 32, 4, (p) => {
  for (let x = 0; x < 32; x++) {
    const k = x / 31;
    if (k < 0.5 && (x % 5) === 2) continue;
    const core = k < 0.3 ? '#6aa8b0' : k < 0.7 ? '#b4e0e4' : '#eefcfc';
    p.set(x, 1, core); p.set(x, 2, core);
    if (k > 0.35) { p.set(x, 0, '#6aa8b0'); p.set(x, 3, '#4a8890'); }
  }
  p.set(31, 0, '#000000', 0); p.set(31, 3, '#000000', 0);
});
/**
 * a warm current: a band of fast water along a smooth path, drawn as streaks of light rushing along it (and bubbles).
 * flow(x, y) is the push a swimmer inside it gets (strongest on the centre line, fading to the band's edge).
 */
export class CurrentStream {
  group = new THREE.Group();
  pts: THREE.Vector2[] = [];
  private tan: THREE.Vector2[] = [];
  private streaks: THREE.InstancedMesh;
  private sk: { s: number; o: number; v: number; l: number }[] = [];
  private on = 0;
  private want = 0;
  private len = 0;
  constructor(ctrl: [number, number][], public hw = 1.5, public force = 30) {
    const curve = new THREE.SplineCurve(ctrl.map(([x, y]) => new THREE.Vector2(x, y)));
    this.pts = curve.getSpacedPoints(48);
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[Math.max(0, i - 1)], b = this.pts[Math.min(this.pts.length - 1, i + 1)];
      this.tan.push(b.clone().sub(a).normalize());
    }
    this.len = curve.getLength();
    const N = 70;
    // each streak is a painted wisp of fast water (bright head, a broken tail that thins out), tinted with the water
    // so the current reads as moving water, not white lines
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.MeshBasicMaterial({ map: streakTex(), color: '#ffffff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.streaks = new THREE.InstancedMesh(g, m, N);
    this.streaks.frustumCulled = false;
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      this.sk.push({ s: Math.random(), o: (Math.random() * 2 - 1) * 0.85, v: 0.75 + Math.random() * 0.5, l: 0.35 + Math.random() * 0.6 });
      this.streaks.setColorAt(i, c.set(i % 3 ? '#7ad8e8' : '#b8f0d8'));
    }
    this.group.add(this.streaks);
  }
  get start() { return this.pts[0]; }
  get end() { return this.pts[this.pts.length - 1]; }
  /** nearest sample to a point: its index and distance */
  private nearest(px: number, py: number) {
    let bi = 0, bd = 1e9;
    for (let i = 0; i < this.pts.length; i++) { const d = Math.hypot(this.pts[i].x - px, this.pts[i].y - py); if (d < bd) { bd = d; bi = i; } }
    return { i: bi, d: bd };
  }
  /** 0..1 how far along the path the point is (nearest sample) */
  along(px: number, py: number) { return this.nearest(px, py).i / (this.pts.length - 1); }
  /** the push at a point (0 outside the band or before it is switched on) */
  flow(px: number, py: number): { x: number; y: number; k: number } {
    const { i, d } = this.nearest(px, py);
    if (d > this.hw || this.on < 0.5 || i >= this.pts.length - 1) return { x: 0, y: 0, k: 0 };
    const k = (1 - (d / this.hw) ** 2) * this.on;
    const t = this.tan[i], c = this.pts[i];
    // along the flow, plus a gentle pull back toward the centre line
    return { x: t.x * this.force * k + (c.x - px) * 6 * k, y: t.y * this.force * k + (c.y - py) * 6 * k, k };
  }
  setOn(v: boolean) { this.want = v ? 1 : 0; }
  update(dt: number, fx?: { emit: (kind: 'bubbleS', x: number, y: number, o: { n: number; spread: number; speed: number; vx?: number; vy?: number }) => void }) {
    this.on += (this.want - this.on) * (1 - Math.exp(-dt * 3));
    const n = this.pts.length - 1;
    for (let i = 0; i < this.sk.length; i++) {
      const s = this.sk[i];
      s.s += (dt * s.v * 9) / Math.max(1, this.len);
      if (s.s > 1) { s.s -= 1; s.o = (Math.random() * 2 - 1) * 0.85; }
      const f = s.s * n, i0 = Math.min(n - 1, Math.floor(f)), k = f - i0;
      const p = this.pts[i0], q = this.pts[i0 + 1], t = this.tan[i0];
      const x = p.x + (q.x - p.x) * k - t.y * s.o * this.hw * 0.8, y = p.y + (q.y - p.y) * k + t.x * s.o * this.hw * 0.8;
      // streaks fade in at the start, out at the end, and with the current's strength
      const fade = Math.min(1, s.s * 6, (1 - s.s) * 6) * this.on;
      _p3.set(x, y, 0.2 + s.o * 0.4);
      _q.setFromAxisAngle(_z, Math.atan2(t.y, t.x));
      _m4.compose(_p3, _q, _s3.set(s.l * (0.5 + fade * 0.9), 0.09 * fade + 1e-4, 1));
      this.streaks.setMatrixAt(i, _m4);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    if (fx && this.on > 0.3 && Math.random() < dt * 14) {
      const p = this.pts[Math.floor(Math.random() * n)], t = this.tan[Math.floor(Math.random() * n)];
      fx.emit('bubbleS', p.x + (Math.random() - 0.5) * this.hw, p.y + (Math.random() - 0.5) * this.hw, { n: 1, spread: 0.1, speed: 0.4, vx: t.x * 3, vy: t.y * 3 });
    }
  }
  dispose() { this.group.removeFromParent(); this.streaks.geometry.dispose(); (this.streaks.material as THREE.Material).dispose(); }
}
const _z = new THREE.Vector3(0, 0, 1);

// ------------------------------------------------------------------ the minnow (the dart lesson)
/** the minnow's on-screen length (m): the real fish pipeline's golden shiner, scaled up to read next to the kid */
const MINNOW_LEN = 0.66;
/**
 * a little golden minnow, quick and skittish: a golden shiner from the fish pipeline (src/fish: lofted body, real
 * fins and eye, the swim shader's body wave). It wanders, bolts away when the kid gets close, flips direction at the
 * edges of its patch, and now and then stops to turn and look back (the moment to DART at it). tired() slows it down
 * for players who need it; caught() spins it round, then it zips off to the far side.
 */
export class Minnow {
  group = new THREE.Group();
  x: number; y: number; vx = 0; vy = 0;
  face = 1;
  private pivot = new THREE.Group();
  private model: FishModel;
  private k: number;
  private yaw = 0; private pitch = 0;
  private t = Math.random() * 5;
  private pauseT = 0; private nextPause = 2.2;
  private spin = 0;
  private dizzy = 0;
  slow = 0;
  constructor(x: number, y: number) {
    this.x = x; this.y = y;
    this.model = buildFish('golden_shiner', 7);
    this.k = MINNOW_LEN / this.model.length;
    this.model.group.scale.setScalar(this.k);
    this.pivot.rotation.order = 'YZX';
    this.pivot.add(this.model.group);
    this.group.add(this.pivot);
  }
  /** after a catch it shakes itself off and zips away; this long before it can be caught again */
  private grace = 0;
  /** spin round after being caught */
  caught() { this.spin = 1; this.dizzy = 0.9; this.model.flash(0.7, '#fff4c0'); }
  get stunned() { return this.dizzy > 0; }
  get catchable() { return this.dizzy <= 0 && this.grace <= 0; }
  /**
   * steer: flee from (kx, ky) inside the patch [x0, x1] x [y0, y1]; `speed` is its bolt speed (m/s)
   */
  update(dt: number, kx: number, ky: number, box: { x0: number; x1: number; y0: number; y1: number }, speed: number) {
    this.t += dt;
    const wasDizzy = this.dizzy > 0;
    this.dizzy = Math.max(0, this.dizzy - dt);
    this.grace = Math.max(0, this.grace - dt);
    this.spin = Math.max(0, this.spin - dt * 1.2);
    if (wasDizzy && this.dizzy <= 0) {
      // shake it off and zip to the far side of the patch (it's a minnow: it doesn't sulk)
      const far = this.x - box.x0 > box.x1 - this.x ? -1 : 1;
      this.vx = far * speed * 1.7; this.vy = (box.y0 + box.y1) / 2 > this.y ? 2 : -2;
      this.grace = 0.8; this.pauseT = 0; this.nextPause = 2.6;
    }
    const dx = this.x - kx, dy = this.y - ky, d = Math.hypot(dx, dy) || 1;
    let tx = 0, ty = 0;
    this.pauseT -= dt; this.nextPause -= dt;
    if (this.nextPause <= 0 && d > 1.6) { this.pauseT = 0.65; this.nextPause = 2.4 + Math.random() * 1.8; }
    if (this.dizzy > 0) { tx = 0; ty = 0.3; }
    else if (this.grace > 0) { tx = this.vx; ty = this.vy; }
    else if (this.pauseT > 0) { tx = -dx / d * 0.3; ty = -dy / d * 0.3; }
    else if (d < 3.4) {
      // bolt away, sliding along the patch edges (and cutting back past the kid when cornered)
      const sp = speed * (1 - this.slow * 0.5);
      tx = (dx / d) * sp; ty = (dy / d) * sp * 0.85;
      const m = 1.4;
      if (this.x < box.x0 + m && tx < 0) { tx = Math.abs(tx) * 0.3; ty += (ty >= 0 ? 1 : -1) * sp * 0.9; }
      if (this.x > box.x1 - m && tx > 0) { tx = -Math.abs(tx) * 0.3; ty += (ty >= 0 ? 1 : -1) * sp * 0.9; }
      if (this.y < box.y0 + m * 0.7 && ty < 0) ty = Math.abs(ty) * 0.6;
      if (this.y > box.y1 - m * 0.7 && ty > 0) ty = -Math.abs(ty) * 0.6;
    } else {
      tx = Math.sin(this.t * 0.7) * 1.4; ty = Math.sin(this.t * 1.1 + 1) * 0.7;
    }
    // stay in the patch
    if (this.x < box.x0) tx += (box.x0 - this.x) * 6; if (this.x > box.x1) tx -= (this.x - box.x1) * 6;
    if (this.y < box.y0) ty += (box.y0 - this.y) * 6; if (this.y > box.y1) ty -= (this.y - box.y1) * 6;
    const k = 1 - Math.exp(-dt * (this.pauseT > 0 ? 6 : 4.5));
    this.vx += (tx - this.vx) * k; this.vy += (ty - this.vy) * k;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (Math.abs(this.vx) > 0.3) this.face = Math.sign(this.vx);
    else if (this.pauseT > 0) this.face = Math.sign(kx - this.x) || this.face;
    // pose: a quick flip turn through the camera-facing pose (the body bends into a C on the way round), pitch with
    // the climb, a barrel roll when caught; the swim shader beats the tail faster when it bolts
    const spd = Math.hypot(this.vx, this.vy);
    const yawT = this.face > 0 ? 0 : -Math.PI;
    const turn = Math.max(-1, Math.min(1, (yawT - this.yaw) * 0.9)) * this.face;
    this.yaw += (yawT - this.yaw) * (1 - Math.exp(-dt * 11));
    const pitchT = this.dizzy > 0 ? 0 : Math.max(-0.6, Math.min(0.6, Math.atan2(this.vy, Math.abs(this.vx) + 0.5)));
    this.pitch += (pitchT - this.pitch) * (1 - Math.exp(-dt * 8));
    this.group.position.set(this.x, this.y + Math.sin(this.t * 2.3) * 0.04, 0.15);
    this.pivot.rotation.set(this.spin * this.t * 25, this.yaw, this.pitch);
    // paused: it eyes the kid, gulping; dizzy: mouth agape
    const m = this.model;
    if (this.pauseT > 0) m.lookAt((kx - this.x) * this.face, ky - this.y); else m.lookAt(1, this.vy * 0.2);
    m.setJaw(this.dizzy > 0 ? 0.9 : this.pauseT > 0 ? 0.35 + Math.sin(this.t * 14) * 0.25 : 0);
    m.update(dt, (spd + 0.4) / this.k, turn);
  }
  dispose() { this.group.removeFromParent(); this.model.dispose(); }
}

// ------------------------------------------------------------------ the trawl net
/** trawl gear page (32 x 32): rows 0-15 a hard orange plastic float (the moulding seam, the rope hole ringed dark,
 *  scuffs, a stencilled number), rows 16-31 rusty chain iron */
const netGearTex = () => ctex('story.netgear', 32, 32, (p) => {
  const O = ['#7a2a08', '#b84a12', '#e86a1e', '#f88a3a', '#ffb070'];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    let t = y < 2 || y > 13 ? 1 : y < 5 ? 3 : y < 11 ? 2 : 1;
    if (y === 7 || y === 8) t = x % 8 === 0 ? 0 : 1;                      // the moulding seam round the middle
    if ((x * 7 + y * 3) % 23 === 0) t = 4;                                // scuffs
    p.set(x, y, O[t]);
  }
  for (const yy of [0, 15]) for (let x = 0; x < 32; x++) p.set(x, yy, '#2a1408');   // the rope holes, ringed dark
  rect(p, 4, 4, 3, 1, '#f4f0e0'); rect(p, 5, 4, 1, 3, '#f4f0e0'); rect(p, 9, 4, 3, 1, '#f4f0e0'); rect(p, 11, 5, 1, 1, '#f4f0e0'); rect(p, 9, 6, 3, 1, '#f4f0e0');
  for (let y = 16; y < 32; y++) for (let x = 0; x < 32; x++) {
    const rust = (x * 5 + y * 3) % 7 < 2;
    p.set(x, y, rust ? ((x + y) % 2 ? '#8a3a14' : '#a85a24') : tone(T.iron, (y % 4 === 1 ? 3 : 1) + ((x + y) % 5 === 0 ? 1 : 0)));
  }
});
const netTex = () => ctex('story.net', 32, 32, (p) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const a = (x + y) % 8, b = (x - y + 32) % 8;
    if (a === 0 || b === 0) p.set(x, y, (x + y) % 16 === 0 || (x - y + 32) % 16 === 0 ? '#c8cca8' : '#a8b08a');
  }
});

/** a bottom trawl: funnel of mesh from a float-lined mouth to the cod-end, towed by two warps */
export class TrawlNet {
  group = new THREE.Group();
  /** where the catch ends up (local space) */
  cod = new THREE.Vector3(5.6, 0, 0);
  mouthTop = new THREE.Vector3(); mouthBot = new THREE.Vector3();
  private mesh: THREE.Mesh;
  private base: Float32Array;
  private warps: THREE.Mesh[] = [];
  private t = 0;
  private floats: THREE.Mesh[] = [];
  constructor(public L = 6.5, public H = 2.3, public Z = 1.6) {
    const rings = 12, seg = 12;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const hy = H * (1 - t * 0.68) * (1 - Math.pow(t, 6) * 0.2), hz = Z * (1 - t * 0.6);
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU;
        const c = Math.cos(a), s = Math.sin(a);
        // a squarish superellipse mouth that rounds off toward the cod-end
        const e = 0.6 + t * 1.4;
        const sx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(s) * Math.pow(Math.abs(s), e);
        pos.push(t * L, sy * hy, sx * hz);
        uv.push(j / seg * 4, t * 5);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.base = new Float32Array(pos);
    const tex = netTex();
    const mat = psxMat(tex, { rough: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    // the headrope's trawl floats (moulded plastic balls threaded on the rope) and the footrope's chain
    const fp: [number, number] = [32, 32], gear = psxMat(netGearTex(), { rough: 0.7, metal: 0.15, emissive: '#200800', emissiveK: 0.15 });
    const floatGeo = lathe([[0, -0.16], [0.07, -0.145], [0.13, -0.09], [0.16, -0.02], [0.165, 0.0], [0.16, 0.02], [0.13, 0.09], [0.07, 0.145], [0, 0.16]], 8, fp, [0, 0, 32, 16]);
    const link = (rx: number): THREE.BufferGeometry => {
      const t = new THREE.TorusGeometry(0.05, 0.016, 4, 8);
      t.scale(1.35, 1, 1);
      const uv = t.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 1 - (16 + uv.getY(i) * 16) / 32);
      // spun about its own long axis (flat / edge-on), then laid along the footrope (z)
      t.rotateX(rx); t.rotateY(Math.PI / 2);
      return t;
    };
    for (let k = 0; k < 7; k++) {
      const z = -Z + (k / 6) * 2 * Z;
      // threaded on the headrope: the rope holes along z, each float turned a little differently round the rope
      const fg = floatGeo.clone(); fg.rotateY(k * 0.7); fg.rotateX(Math.PI / 2);
      const f = new THREE.Mesh(fg, gear);
      f.castShadow = true;
      f.position.set(0, H + 0.1, z * 0.95);
      this.floats.push(f);
      this.group.add(f);
    }
    // a run of chain links along the footrope, alternating flat and edge-on
    const links: THREE.BufferGeometry[] = [];
    for (let k = 0; k <= 20; k++) links.push(xf(link(k % 2 ? Math.PI / 2 : 0), [0, -H - 0.05, -Z * 0.95 + (k / 20) * 2 * Z * 0.95]));
    this.group.add(propMesh(links, gear, false));
    for (let k = 0; k < 2; k++) {
      const w = M(new THREE.CylinderGeometry(0.025, 0.025, 1, 4), flat('#5a4a32'), false);
      this.warps.push(w);
    }
    this.mouthTop.set(0, H, 0); this.mouthBot.set(0, -H, 0);
  }
  /** add the warps (they live in world space) */
  attachTo(scene: THREE.Object3D) { for (const w of this.warps) scene.add(w); scene.add(this.group); }
  /** stretch the warps from the mouth corners to a world point (the boat's stern) */
  tow(to: THREE.Vector3) {
    this.group.updateMatrixWorld(true);
    const corners = [new THREE.Vector3(0, this.H, -this.Z * 0.9), new THREE.Vector3(0, this.H, this.Z * 0.9)];
    corners.forEach((c, i) => {
      const a = this.group.localToWorld(c.clone());
      const w = this.warps[i];
      const d = to.clone().sub(a);
      w.position.copy(a).addScaledVector(d, 0.5);
      w.scale.set(1, d.length(), 1);
      w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    });
  }
  /** billow the mesh (k: how hard it is being dragged) */
  update(dt: number, k = 1) {
    this.t += dt;
    const p = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const x = this.base[i * 3], y = this.base[i * 3 + 1], z = this.base[i * 3 + 2];
      const t = x / this.L;
      const wv = Math.sin(this.t * 2.4 - x * 1.3 + z * 1.5) * 0.12 * (0.4 + t) * k;
      p.setXYZ(i, x - Math.abs(y) * 0.12 * t * k, y + wv, z * (1 + Math.sin(this.t * 1.7 + x) * 0.06));
    }
    p.needsUpdate = true;
    this.floats.forEach((f, i) => { f.position.y = this.H + 0.1 + Math.sin(this.t * 3 + i) * 0.04; });
  }
  setVisible(v: boolean) { this.group.visible = v; for (const w of this.warps) w.visible = v; }
  dispose() { this.group.removeFromParent(); for (const w of this.warps) w.removeFromParent(); }
}
