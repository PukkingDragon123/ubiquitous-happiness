// The underwater signpost the title's travelling shot arrives at: an old waterlogged post planted in a rock
// cairn, barnacled, wrapped in a kelp strand and rope, with
//   - the TITLE PLANK on top: BLOBFISH in chunky weathered voxel letters (real 3D, painted cream / gold over a
//     dark outline) and REEL REBELLION V-carved into the wood below (a real height-field normal map + paint),
//   - two carved ARROW BOARDS on iron pegs: NEW GAME (pointing on, to the right) and RESUME (pointing back home,
//     to the left; greyed, dusty and silted over when there is no save),
//   - a carved wooden GEAR nailed to the post (settings),
//   - a brass LANTERN hanging off the plank on a rope, swinging in the current.
// Hovering a board warms it (emissive glow of its own paint), kicks a wobble on its peg and brightens the lantern.
//
//   const s = new Signpost(); scene.add(s.group); s.group.position.set(x, floorY, z);
//   s.setEnabled('resume', hasSave); s.pick(raycaster) -> 'new' | 'resume' | 'gear' | null
//   s.update(dt, t, hot)   (hot = the board under the mouse / keyboard selection);  s.lanternWorld(v)
import * as THREE from 'three';
import { Px, hex, mix, type RGB } from '../gfx/px';
import { psxMat, facet } from '../player/psx';
import { Kit } from '../hideout/kit';
import { glyphs, type FontName } from '../ui/pixel/font';
import { Voxels } from '../gfx/voxel';
import { boulder, rockPage, KELP, BRASS, GLOWP } from './art';
import { fbm, hash2, damp, clamp01, TAU } from '../core/math';

export type BoardId = 'new' | 'resume' | 'gear';

// ------------------------------------------------------------------ text masks + carving
interface Mask { w: number; h: number; m: Uint8Array }
/** the pixel font's hard on/off mask of a string, trimmed to its ink, optionally dilated (bold) */
function textMask(str: string, font: FontName, bold = 0): Mask {
  const g = glyphs(str, { font, color: '#ffffff' });
  const d = g.cv.getContext('2d')!.getImageData(0, 0, g.w, g.h).data;
  let x0 = g.w, y0 = g.h, x1 = -1, y1 = -1;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (d[(y * g.w + x) * 4 + 3] > 127) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) return { w: 1, h: 1, m: new Uint8Array(1) };
  const w = x1 - x0 + 1 + bold * 2, h = y1 - y0 + 1 + bold * 2;
  const m = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (d[(y * g.w + x) * 4 + 3] <= 127) continue;
    for (let dy = -bold; dy <= bold; dy++) for (let dx = -bold; dx <= bold; dx++) {
      if (bold > 0 && Math.abs(dx) + Math.abs(dy) > bold) continue;
      m[(y - y0 + bold + dy) * w + (x - x0 + bold + dx)] = 1;
    }
  }
  return { w, h, m };
}
const on = (k: Mask, x: number, y: number) => x >= 0 && y >= 0 && x < k.w && y < k.h && k.m[y * k.w + x] === 1;

/**
 * V-carve a mask into a page at texel scale s (each font pixel = s x s texels), centred on (cx, cy). Writes the
 * groove depth into H (0 surface .. -1 deepest) and paints the groove: paint tones [shadow, mid, lit] by which
 * way each groove wall faces the light (upper left), with chips where the paint has flaked off to bare wood.
 */
function carve(p: Px, H: Float32Array, k: Mask, cx: number, cy: number, s: number, paint: [string, string, string], o: { chip?: number; bare?: string; seed?: number } = {}) {
  const x0 = Math.round(cx - (k.w * s) / 2), y0 = Math.round(cy - (k.h * s) / 2);
  const W = k.w * s, Hh = k.h * s;
  // chamfer distance (in texels) from each inside texel to the nearest outside one
  const dist = new Float32Array(W * Hh).fill(0);
  const ins = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < Hh && on(k, Math.floor(x / s), Math.floor(y / s));
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) dist[y * W + x] = ins(x, y) ? 1e3 : 0;
  for (let pass = 0; pass < 2; pass++) {
    const fw = pass === 0;
    for (let yy = 0; yy < Hh; yy++) for (let xx = 0; xx < W; xx++) {
      const x = fw ? xx : W - 1 - xx, y = fw ? yy : Hh - 1 - yy;
      const i = y * W + x; if (dist[i] === 0) continue;
      const d = fw ? -1 : 1;
      const nb = (a: number, b: number) => (a < 0 || b < 0 || a >= W || b >= Hh ? 0 : dist[b * W + a]);
      dist[i] = Math.min(dist[i], nb(x + d, y) + 1, nb(x, y + d) + 1, nb(x + d, y + d) + 1.4, nb(x - d, y + d) + 1.4);
    }
  }
  const D = Math.max(1.5, s * 0.9);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dd = dist[y * W + x]; if (!dd) continue;
    const px = x0 + x, py = y0 + y;
    if (!p.inside(px, py)) continue;
    H[py * p.w + px] = -Math.min(1, dd / D);
  }
  const P = paint.map((c) => hex(c));
  const bare = hex(o.bare ?? '#2a2016');
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    if (!dist[y * W + x]) continue;
    const px = x0 + x, py = y0 + y;
    if (!p.inside(px, py)) continue;
    const h = (a: number, b: number) => (p.inside(a, b) ? H[b * p.w + a] : 0);
    const slope = (h(px + 1, py) - h(px - 1, py)) + (h(px, py + 1) - h(px, py - 1));
    let c: RGB = slope > 0.55 ? P[2] : slope < -0.55 ? P[0] : P[1];
    const fx = Math.floor(x / s), fy = Math.floor(y / s);
    if (hash2(fx >> 1, fy >> 1, (o.seed ?? 3) + 11) < (o.chip ?? 0.08)) c = mix(bare, c, 0.55);
    p.set(px, py, c);
  }
}

/** waterlogged plank wood: horizontal grain streaks, dark seams between boards, worn edges, an algae film */
function woodPage(p: Px, ts: string[], o: { seed?: number; seams?: number[]; vertical?: boolean; algae?: number; grey?: number } = {}) {
  const sd = o.seed ?? 1;
  const T = ts.map((c) => hex(c));
  p.fill((x, y) => {
    const u = o.vertical ? y : x, v = o.vertical ? x : y;
    const g = fbm(u * 0.035, v * 0.45, 3, sd) + (fbm(u * 0.2, v * 0.9, 2, sd + 7) - 0.5) * 0.35;
    let k = Math.floor(clamp01(g * 1.25 - 0.1) * 3.99) + 1;
    if (hash2(Math.floor(u / 9), v, sd + 2) < 0.06) k = 0; // a dark grain streak
    return T[Math.max(0, Math.min(T.length - 1, k))];
  });
  // knots
  for (let i = 0; i < 3; i++) {
    const kx = Math.floor(hash2(i, 1, sd) * p.w), ky = Math.floor(hash2(i, 2, sd) * p.h);
    p.ellipse(kx, ky, 3.5, 2, T[0]); p.ellipse(kx, ky, 2, 1.1, T[2]); p.set(kx, ky, T[0]);
  }
  for (const s of o.seams ?? []) for (let i = 0; i < (o.vertical ? p.h : p.w); i++) {
    if (o.vertical) { p.set(s, i, T[0]); p.set(s + 1, i, T[1]); } else { p.set(i, s, T[0]); p.set(i, s + 1, T[1]); p.set(i, s - 1, T[3]); }
  }
  // worn edges, darker toward the bottom (silt), algae creeping up from below and in from the ends
  const algae = hex('#2c4a20'), algae2 = hex('#46682c');
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const e = Math.min(x, y, p.w - 1 - x, p.h - 1 - y);
    if (e === 0) p.shadePx(x, y, -0.35);
    const a = (o.algae ?? 0.5) * (clamp01((y / p.h - 0.55) * 2.2) + clamp01(1 - Math.min(x, p.w - 1 - x) / 14) * 0.6);
    const n = fbm(x * 0.12, y * 0.12, 2, sd + 5);
    if (n < a * 0.75) p.set(x, y, mix(p.get(x, y) as unknown as RGB, n < a * 0.4 ? algae : algae2, 0.65));
    if (o.grey) p.set(x, y, mix(p.get(x, y) as unknown as RGB, hex('#8a8a84'), o.grey * (0.6 + fbm(x * 0.3, y * 0.3, 1, sd) * 0.6)));
  }
}

/** a flat slab from a polygon (front face +z with the page mapped over the polygon's bounds, sides + back) */
function slabGeo(poly0: [number, number][], depth: number): THREE.BufferGeometry {
  // counter-clockwise (seen from +z) so the front faces and the side quads face outward
  let area = 0;
  for (let i = 0; i < poly0.length; i++) { const [ax, ay] = poly0[i], [bx, by] = poly0[(i + 1) % poly0.length]; area += ax * by - bx * ay; }
  const poly = area < 0 ? [...poly0].reverse() : poly0;
  const xs = poly.map((q) => q[0]), ys = poly.map((q) => q[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = maxX - minX, H = maxY - minY;
  const tris = THREE.ShapeUtils.triangulateShape(poly.map(([x, y]) => new THREE.Vector2(x, y)), []).map(([a, b, c]) => {
    const cr = (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
    return cr < 0 ? [a, c, b] : [a, b, c];
  });
  const P: number[] = [], U: number[] = [];
  const zf = depth / 2, zb = -depth / 2;
  for (const [a, b, c] of tris) for (const i of [a, b, c]) { P.push(poly[i][0], poly[i][1], zf); U.push((poly[i][0] - minX) / W, (poly[i][1] - minY) / H); }
  const front = P.length / 3;
  for (const [a, b, c] of tris) for (const i of [a, c, b]) { P.push(poly[i][0], poly[i][1], zb); U.push(0.02 + ((poly[i][0] - minX) / W) * 0.05, 0.05 + ((poly[i][1] - minY) / H) * 0.05); }
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
    const L = Math.hypot(bx - ax, by - ay);
    const u0 = s * 0.3, u1 = (s + L) * 0.3; s += L;
    P.push(ax, ay, zf, bx, by, zb, bx, by, zf, ax, ay, zf, ax, ay, zb, bx, by, zb);
    U.push(u0, 0.9, u1, 0.85, u1, 0.9, u0, 0.9, u0, 0.85, u1, 0.85);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.addGroup(0, front, 0);
  g.addGroup(front, P.length / 3 - front, 1);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ palettes
const WOOD = ['#1c1610', '#33291c', '#4c3e2a', '#66563a', '#82704c'];
const WOOD_DRY = ['#1e1c18', '#36322a', '#4e4a3e', '#686252', '#827c6a'];
const CREAM: [string, string, string] = ['#b89a64', '#ecd8a4', '#fff6d6'];
const RED: [string, string, string] = ['#7a1a14', '#c43a2c', '#f07050'];
const GREY: [string, string, string] = ['#5a5852', '#7a766c', '#9a968a'];

// sizes (metres)
const POST_H = 5.7, POST_W = 0.36;
const PLANK = { w: 4.0, h: 1.36, y: 4.72, d: 0.15 };
const BOARD_H = 0.62, BOARD_D = 0.11;
const FONT_M = 0.0158; // metres per font pixel on the boards (the big font, one texel per font pixel)

interface Board {
  id: BoardId; pivot: THREE.Group; mats: THREE.MeshStandardMaterial[]; meshes: THREE.Object3D[];
  ang: number; vel: number; glow: number; enabled: boolean; dir: number; tip: THREE.Vector3; rest: number;
}

export class Signpost {
  group = new THREE.Group();
  boards: Record<BoardId, Board>;
  private lantern: { pivot: THREE.Group; glass: THREE.MeshBasicMaterial; ang: number; vel: number; bright: number };
  private gearSpin = 0;
  private dust: THREE.Mesh;
  private v = new THREE.Vector3();

  constructor() {
    const G = this.group;
    const rockM = [psxMat(rockPage(false), { rough: 0.95 }), psxMat(rockPage(true), { rough: 0.95, sss: [0.6, 1, 0.5], sssK: 0.15 })];
    for (const m of rockM) (m.userData.uw as { uMatRimG: { value: number } }).uMatRimG.value = 0.12;
    // ---- the cairn the post is planted in
    const cairn: [number, number, number, number, number, number][] = [
      [0.55, 0.12, 0.25, 0.75, 0.45, 0.6], [-0.6, 0.1, 0.15, 0.7, 0.4, 0.55], [0.1, 0.05, 0.62, 0.55, 0.32, 0.4],
      [-0.2, 0.05, -0.55, 0.8, 0.5, 0.5], [1.15, 0.0, -0.1, 0.45, 0.28, 0.4], [-1.2, 0.0, 0.3, 0.42, 0.24, 0.38],
    ];
    cairn.forEach(([x, y, z, sx, sy, sz], i) => {
      const m = new THREE.Mesh(boulder(60 + i, sx, sy, sz, 1, 0.45, { top: 0.35 }), rockM);
      m.position.set(x, y + sy * 0.4, z); m.rotation.y = i * 1.3; m.castShadow = true; m.receiveShadow = true;
      G.add(m);
    });
    // ---- the post: vertical grain, barnacled, slightly leaning, a weathered cap
    const postPage = new Px(32, 128);
    woodPage(postPage, WOOD, { seed: 4, vertical: true, seams: [15], algae: 0.65 });
    const postM = psxMat(postPage.texture({ repeat: true }), { rough: 0.9 });
    const post = new THREE.Group(); post.rotation.z = 0.025; G.add(post);
    const pk = new Kit();
    pk.box(postM, POST_W, POST_H, POST_W, 0, POST_H / 2 - 0.2, 0, { chamfer: 0.03, d: 0.5, uv: 'keep' });
    pk.add(postM, new THREE.ConeGeometry(POST_W * 0.78, 0.26, 4), 0, POST_H - 0.07, 0, { ry: Math.PI / 4 });
    // barnacles up the post and on the plank corners
    const barn = psxMat(null, { color: '#cfc6b2', rough: 0.95 }), hole = psxMat(null, { color: '#1a1410', rough: 1 });
    const barnacle = (k: Kit, x: number, y: number, z: number, s: number, rx = 0, rz = 0) => { k.cyl(barn, s * 0.45, s, s * 1.1, x, y, z, { seg: 6, rx, rz }); k.cyl(hole, s * 0.28, s * 0.28, 0.01, x + Math.sin(-rz) * s * 0.56, y + Math.cos(rx) * Math.cos(rz) * s * 0.56, z + Math.sin(rx) * s * 0.56, { seg: 5, rx, rz }); };
    for (let i = 0; i < 26; i++) {
      const y = 0.25 + hash2(i, 1, 2) * (i < 18 ? 1.6 : 4.8), side = Math.floor(hash2(i, 2, 2) * 3);
      const s = 0.035 + hash2(i, 3, 2) * 0.04;
      if (side === 0) barnacle(pk, (hash2(i, 4, 2) - 0.5) * 0.28, y, POST_W / 2 + 0.01, s, Math.PI / 2);
      else barnacle(pk, (side === 1 ? -1 : 1) * (POST_W / 2 + 0.01), y, (hash2(i, 4, 2) - 0.5) * 0.28, s, 0, (side === 1 ? 1 : -1) * Math.PI / 2);
    }
    // rope lashings: under the plank and round the board pegs
    const ropeM = psxMat(null, { color: '#9a7a4a', rough: 1 });
    for (const [y0, n] of [[PLANK.y - PLANK.h / 2 - 0.12, 4], [1.95, 3]] as const) for (let i = 0; i < n; i++) pk.add(ropeM, new THREE.TorusGeometry(POST_W * 0.62, 0.028, 4, 8), 0, y0 - i * 0.065, 0, { rx: Math.PI / 2 + (i % 2 ? 0.08 : -0.08), d: 4 });
    post.add(pk.build());
    // a kelp strand spiralling up the post (no sway: it is wound tight), a couple of loose blades at the top
    const kelpLeaf = psxMat(KELP(), { rough: 0.8, side: THREE.DoubleSide, alphaTest: 0.5, sss: [0.8, 1, 0.4], sssK: 0.6 });
    const kk = new Kit();
    for (let i = 0; i < 30; i++) {
      const a = i * 0.55 + 0.6, y = i < 8 ? 0.12 + i * 0.07 : 1.62 + (i - 8) * 0.06;
      const r = POST_W * 0.62;
      const g = new THREE.PlaneGeometry(0.15, 0.3);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let q = 0; q < uv.count; q++) uv.setXY(q, 0.25 + uv.getX(q) * 0.75, (uv.getY(q) + i * 0.3) % 1);
      kk.add(kelpLeaf, g, Math.sin(a) * r, y, Math.cos(a) * r, { ry: a, rz: 0.5, uv: 'keep' });
    }
    post.add(kk.build(false));

    // ---- the title plank: BLOBFISH in voxels over REEL REBELLION carved into two weathered boards
    const plank = new THREE.Group(); plank.position.set(0.05, PLANK.y, POST_W / 2 + PLANK.d / 2); plank.rotation.z = -0.022; post.add(plank);
    const PW = 384, PH = Math.round(PW * PLANK.h / PLANK.w);
    const pp = new Px(PW, PH), ph = new Float32Array(PW * PH);
    woodPage(pp, WOOD, { seed: 9, seams: [Math.round(PH * 0.52)], algae: 0.55 });
    const sub = textMask('REEL REBELLION', 'title', 1);
    carve(pp, ph, sub, PW / 2, Math.round(PH * 0.76), 2, RED, { chip: 0.03, seed: 2 });
    // nail heads at the board ends
    for (const [nx, ny] of [[10, 12], [PW - 11, 12], [10, PH - 14], [PW - 11, PH - 14], [PW / 2 - 2, 8], [PW / 2 + 2, PH - 10]]) { pp.ellipse(nx, ny, 2.4, 2.4, '#3a3632'); pp.set(nx - 1, ny - 1, '#8a8478'); }
    const plankTex = pp.texture();
    const plankN = Px.normalMap(PW, PH, (x, y) => ph[y * PW + x] * 2.2, 2.5);
    const plankM = psxMat(plankTex, { rough: 0.85 }); plankM.normalMap = plankN; plankM.normalScale.set(1, 1);
    const plankSide = psxMat(postPage.texture({ repeat: true }), { rough: 0.9 });
    const hw = PLANK.w / 2, hh = PLANK.h / 2;
    // a chipped top-right corner and a bitten bottom edge
    const plankPoly: [number, number][] = [[-hw, -hh], [hw * 0.35, -hh], [hw * 0.42, -hh + 0.05], [hw * 0.5, -hh], [hw, -hh], [hw, hh - 0.18], [hw - 0.13, hh - 0.05], [hw - 0.3, hh], [-hw, hh]];
    const pm = new THREE.Mesh(slabGeo(plankPoly, PLANK.d), [plankM, plankSide]);
    pm.castShadow = true; pm.receiveShadow = true; plank.add(pm);
    // the voxel letters
    const big = textMask('BLOBFISH', 'big', 0);
    const OUT = 1, VW = big.w + OUT * 2, VH = big.h + OUT * 2, VD = 4;
    const V = new Voxels(VW, VH, VD);
    const fillTop = hex('#fff2c8'), fillBot = hex('#f0a040'), outC = hex('#4a140a'), chipC = hex('#7a5a34');
    for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
      const fx = x - OUT, fy = y - OUT;
      const ink = on(big, fx, fy);
      const edge = !ink && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => on(big, fx + dx, fy + dy));
      if (!ink && !edge) continue;
      const vy = VH - 1 - y;
      if (edge) { for (let z = 0; z < 2; z++) V.set(x, vy, z, (outC[0] << 16) | (outC[1] << 8) | outC[2]); continue; }
      const t = fy / Math.max(1, big.h - 1);
      let c = mix(fillTop, fillBot, Math.min(1, t * 1.15));
      const band = Math.floor(t * 4);
      if (band === 0 && fx % 7 === 3) c = mix(c, hex('#ffffff'), 0.4);
      const chip = hash2(fx >> 1, fy >> 1, 31) < 0.05;
      if (chip) c = mix(c, chipC, 0.45);
      if (hash2(fx, fy, 37) < 0.05) c = mix(c, hex('#4a6a2c'), 0.6); // algae specks
      const n = (c[0] << 16) | (c[1] << 8) | c[2];
      const depth = chip ? VD - 1 : VD;
      for (let z = 0; z < depth; z++) V.set(x, vy, z, z < 2 ? (outC[0] << 16) | (outC[1] << 8) | outC[2] : n);
    }
    const vs = PLANK.w * 0.84 / VW;
    const vg = V.mesh(vs);
    const letters = new THREE.Mesh(vg, psxMat(null, { vertexColors: true, rough: 0.7 }));
    letters.position.set(-0.02, hh * 0.02, PLANK.d / 2 - 0.005 + (VD * vs) / 2);
    letters.castShadow = true;
    plank.add(letters);
    // barnacles on the plank corners
    const bk = new Kit();
    for (let i = 0; i < 9; i++) { const c = i % 3; const x = (c === 0 ? -hw + 0.12 : c === 1 ? hw - 0.2 : -hw + 0.35) + (hash2(i, 1, 7) - 0.5) * 0.18, y = -hh + 0.1 + hash2(i, 2, 7) * 0.22; barnacle(bk, x, y, PLANK.d / 2 + 0.015, 0.03 + hash2(i, 3, 7) * 0.03, Math.PI / 2); }
    plank.add(bk.build());

    // ---- the arrow boards
    const mkBoard = (id: BoardId, label: string, dir: 1 | -1, y: number, len: number, enabled: boolean): Board => {
      const pivot = new THREE.Group(); pivot.position.set(0, y, POST_W / 2 + BOARD_D / 2 + 0.01); post.add(pivot);
      const tipL = 0.42, back = 0.2, h2 = BOARD_H / 2;
      // in the board's own frame the arrow points along +x; mirrored for dir -1 (the page is mapped after mirroring)
      let poly: [number, number][] = [[-back, -h2], [len - tipL, -h2], [len - tipL + 0.02, -h2 - 0.07], [len, 0.02], [len - tipL + 0.02, h2 + 0.07], [len - tipL, h2], [-back, h2]];
      if (dir < 0) poly = poly.map(([x, yy]) => [-x, yy] as [number, number]).reverse();
      const W = len + back, Wpx = Math.round(W / FONT_M), Hpx = Math.round((BOARD_H + 0.14) / FONT_M);
      const bp = new Px(Wpx, Hpx), bh = new Float32Array(Wpx * Hpx);
      woodPage(bp, enabled ? WOOD : WOOD_DRY, { seed: id === 'new' ? 21 : 33, seams: [], algae: enabled ? 0.45 : 0.7, grey: enabled ? 0 : 0.35 });
      const mk = textMask(label, 'big', 0);
      // centre the text on the board's straight part (away from the point)
      const straight0 = dir > 0 ? back : tipL, straightW = len + back - tipL;
      const cxm = dir > 0 ? (straight0 + straightW / 2 - 0.0) : (tipL + straightW / 2);
      carve(bp, bh, mk, Math.round((cxm / W) * Wpx), Math.round(Hpx / 2), 1, enabled ? CREAM : GREY, { chip: enabled ? 0.03 : 0.2, seed: id === 'new' ? 5 : 8 });
      if (!enabled) {
        // silt and dust settled on the dead board: pale speckle heavier toward the top edge, a crust of grey sponge
        for (let yy = 0; yy < Hpx; yy++) for (let xx = 0; xx < Wpx; xx++) {
          const k = (1 - yy / Hpx) * 0.55 + 0.1;
          if (hash2(xx, yy, 77) < k * 0.35) bp.set(xx, yy, mix(bp.get(xx, yy) as unknown as RGB, hex('#b8b4a4'), 0.55));
        }
      }
      // the peg hole and a painted border stripe
      const pegX = dir > 0 ? Math.round((back / W) * Wpx) : Math.round(((W - back) / W) * Wpx);
      bp.ellipse(pegX, Hpx / 2, 3, 3, '#14100a');
      const tex = bp.texture();
      const nrm = Px.normalMap(Wpx, Hpx, (xx, yy) => bh[yy * Wpx + xx] * 2.2, 2.5);
      const front = psxMat(tex, { rough: 0.85, emissive: '#ff8a3a', emissiveK: 0, emissiveMap: tex });
      front.normalMap = nrm;
      const side = psxMat(postPage.texture({ repeat: true }), { rough: 0.9, color: enabled ? '#ffffff' : '#a8a49a' });
      const mesh = new THREE.Mesh(slabGeo(poly, BOARD_D), [front, side]);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.board = id;
      pivot.add(mesh);
      // the iron peg it hangs on
      const peg = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 6)), psxMat(null, { color: '#3a3632', metal: 0.3, rough: 0.6 }));
      peg.rotation.x = Math.PI / 2; peg.position.set(0, 0, BOARD_D / 2 + 0.04); pivot.add(peg);
      const pk2 = new Kit();
      for (let i = 0; i < 3; i++) barnacle(pk2, dir * (len * (0.55 + i * 0.12)) + (hash2(i, 9, id.length) - 0.5) * 0.2, -h2 + 0.06 + i * 0.05, BOARD_D / 2 + 0.012, 0.025 + i * 0.006, Math.PI / 2);
      pivot.add(pk2.build());
      const b: Board = { id, pivot, mats: [front], meshes: [mesh], ang: 0, vel: 0, glow: 0, enabled, dir, tip: new THREE.Vector3(dir * len, 0, 0), rest: dir > 0 ? -0.035 : 0.04 };
      pivot.rotation.z = b.rest;
      return b;
    };
    const nb = mkBoard('new', 'NEW GAME', 1, 3.42, 2.95, true);
    const rb = mkBoard('resume', 'RESUME', -1, 2.5, 2.55, true);
    const rbOff = mkBoard('resume', 'RESUME', -1, 2.5, 2.55, false);
    rbOff.pivot.visible = false;
    this.offResume = rbOff; this.onResume = rb;

    // ---- the carved gear (settings), nailed low on the post
    const gearPivot = new THREE.Group(); gearPivot.position.set(0, 1.12, POST_W / 2 + 0.07); post.add(gearPivot);
    const gearPage = new Px(32, 32); woodPage(gearPage, WOOD, { seed: 13, algae: 0.2 });
    const gearTex = gearPage.texture({ repeat: true });
    const gearM = psxMat(gearTex, { rough: 0.85, emissive: '#ff9a4a', emissiveK: 0, emissiveMap: gearTex });
    const gk = new Kit();
    gk.cyl(gearM, 0.33, 0.33, 0.09, 0, 0, 0, { rx: Math.PI / 2, seg: 10, d: 3 });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; gk.box(gearM, 0.14, 0.13, 0.09, Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0, { rz: a, d: 3, chamfer: 0.014 }); }
    // spokes cut out of the wheel: dark holes between brass-capped spokes
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.3; gk.cyl(psxMat(null, { color: '#120c08', rough: 1 }), 0.07, 0.07, 0.1, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.005, { rx: Math.PI / 2, seg: 6 }); }
    const gearMesh = gk.build();
    gearMesh.traverse((o) => { o.userData.board = 'gear'; });
    gearPivot.add(gearMesh);
    const hub = new THREE.Mesh(facet(new THREE.CylinderGeometry(0.08, 0.08, 0.1, 6)), psxMat(BRASS(), { metal: 0.6, rough: 0.4 }));
    hub.rotation.x = Math.PI / 2; hub.position.z = 0.04; hub.scale.setScalar(1.25); gearPivot.add(hub);
    const gb: Board = { id: 'gear', pivot: gearPivot, mats: [gearM], meshes: [gearMesh], ang: 0, vel: 0, glow: 0, enabled: true, dir: 0, tip: new THREE.Vector3(), rest: 0 };
    this.boards = { new: nb, resume: rb, gear: gb };

    // ---- the lantern, hung off the plank's left end on a rope
    const lp = new THREE.Group(); lp.position.set(-PLANK.w / 2 + 0.25, PLANK.y - PLANK.h / 2 - 0.02, POST_W / 2 + PLANK.d + 0.08); post.add(lp);
    const iron = psxMat(null, { color: '#2a2622', metal: 0.4, rough: 0.5 });
    const lk = new Kit();
    lk.box(ropeM, 0.025, 0.42, 0.025, 0, -0.21, 0, { chamfer: 0 });
    lk.add(iron, new THREE.TorusGeometry(0.07, 0.014, 4, 8), 0, -0.46, 0);
    lk.add(psxMat(BRASS(), { metal: 0.6, rough: 0.4 }), new THREE.ConeGeometry(0.16, 0.13, 6), 0, -0.56, 0);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; lk.box(iron, 0.018, 0.3, 0.018, Math.cos(a) * 0.12, -0.78, Math.sin(a) * 0.12, { chamfer: 0 }); }
    lk.cyl(psxMat(BRASS(), { metal: 0.6, rough: 0.4 }), 0.14, 0.14, 0.04, 0, -0.95, 0, { seg: 6 });
    lp.add(lk.build());
    const glass = new THREE.MeshBasicMaterial({ map: GLOWP(), color: new THREE.Color(2.2, 1.6, 0.9) });
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.11, 0.26, 6), glass); gl.position.y = -0.78; lp.add(gl);
    this.lantern = { pivot: lp, glass, ang: 0.1, vel: 0, bright: 0 };

    // silt haze that settles on the dead RESUME board (a faint grey card)
    this.dust = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshBasicMaterial({ color: '#c8c4b4', transparent: true, opacity: 0.0, depthWrite: false }));
    this.dust.visible = false;
  }
  private offResume!: Board;
  private onResume!: Board;

  /** RESUME greyed and dusty (no save) or live */
  setEnabled(id: 'resume', yes: boolean) {
    this.onResume.pivot.visible = yes; this.offResume.pivot.visible = !yes;
    this.boards[id] = yes ? this.onResume : this.offResume;
  }

  /** the board under a ray (enabled or not) */
  pick(ray: THREE.Raycaster): BoardId | null {
    const objs = (Object.values(this.boards) as Board[]).filter((b) => b.pivot.visible).flatMap((b) => b.meshes);
    for (const h of ray.intersectObjects(objs, true)) {
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.board) o = o.parent;
      if (o) return o.userData.board as BoardId;
    }
    return null;
  }

  /** world point at the end of a board's arrow (where the hero swims off toward) */
  tipWorld(id: BoardId, out = new THREE.Vector3()) { const b = this.boards[id]; b.pivot.updateWorldMatrix(true, false); return b.pivot.localToWorld(out.copy(b.tip)); }
  boardWorld(id: BoardId, out = new THREE.Vector3()) { const b = this.boards[id]; b.pivot.updateWorldMatrix(true, false); return b.pivot.localToWorld(out.set(b.dir * 1.2, 0, 0.1)); }
  lanternWorld(out = new THREE.Vector3()) { this.lantern.pivot.updateWorldMatrix(true, false); return this.lantern.pivot.localToWorld(out.set(0, -0.78, 0.2)); }

  /** kick a board's wobble (hover enter, click) */
  knock(id: BoardId, k = 1) { const b = this.boards[id]; b.vel += (b.dir || 1) * k * 2.4; if (id === 'gear') this.gearSpin += k * 3; }

  /** the lantern's brightness 0..1 (the screen drives the point light from it) */
  get lanternK() { return 0.75 + this.lantern.bright * 0.6; }

  update(dt: number, t: number, hot: BoardId | null) {
    for (const b of Object.values(this.boards) as Board[]) {
      const isHot = hot === b.id && b.enabled;
      b.glow = damp(b.glow, isHot ? 1 : 0, 10, dt);
      // a damped spring on the peg, plus the current nudging it
      const cur = Math.sin(t * 0.8 + b.rest * 40) * 0.012 + Math.sin(t * 2.1 + b.dir) * 0.004;
      const acc = -(b.ang - cur) * 38 - b.vel * 3.2;
      b.vel += acc * dt; b.ang += b.vel * dt;
      if (b.id === 'gear') { this.gearSpin *= Math.exp(-dt * 1.5); b.pivot.rotation.z += this.gearSpin * dt + (isHot ? dt * 0.6 : 0); }
      else b.pivot.rotation.z = b.rest + b.ang;
      for (const m of b.mats) m.emissiveIntensity = b.glow * (0.55 + Math.sin(t * 6) * 0.05);
    }
    // the lantern swings on its rope and brightens while anything is hovered
    const L = this.lantern;
    L.bright = damp(L.bright, hot && this.boards[hot].enabled ? 1 : 0, 6, dt);
    const push = Math.sin(t * 0.6) * 0.06 + Math.sin(t * 1.7 + 1) * 0.02;
    L.vel += (-(L.ang - push) * 9 - L.vel * 0.8) * dt; L.ang += L.vel * dt;
    L.pivot.rotation.z = L.ang; L.pivot.rotation.x = Math.sin(t * 0.45) * 0.05;
    const fl = 0.86 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1) + 0.06 * Math.sin(t * 17);
    const k = fl * this.lanternK;
    L.glass.color.setRGB(2.3 * k, 1.65 * k, 0.9 * k);
    void this.v;
  }
}
