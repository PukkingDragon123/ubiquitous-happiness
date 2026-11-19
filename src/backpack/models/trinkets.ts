// TRINKETS: bottle cap, rubber duck, message in a bottle, compass, shark-tooth necklace, anglerfish lantern, mermaid
// scale, starfish, crab claw, old boot, spiral shell, teacup.
import * as THREE from 'three';
import { mat, cbox, hull, cyl, cone, tube, ext, ball, surf, warp, torus, lathe, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, tc, type Pal } from './paint';
import { pageMap, bottleGeo, corkMat, toothPart } from './parts';
import { S } from './shared';
import type { Build } from './types';

const rgb = (p: Pal, t: number) => tc(p, t);

export const TRINKET_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- a crown cap: red, a white star, 21 crimps; WINNER inside
  bottleCap(b) {
    const T = tx('cap', 48, 64, (p) => {
      // top face (0..48): red enamel, a white ring and star
      p.ellipse(24, 24, 24, 24, (nx, ny) => rgb(PAL.red, Math.hypot(nx, ny) > 0.9 ? 2.5 : nx + ny < -0.6 ? 4.5 : 3.5));
      p.ellipse(24, 24, 15, 15, (nx, ny) => (Math.hypot(nx, ny) > 0.82 ? rgb(PAL.white, 4.5) : null));
      p.star(25, 26, 10, rgb(PAL.red, 1)); p.star(24, 25, 10, rgb(PAL.white, 5));
      p.glint(10, 10, 1);
      // the skirt band (48..56): crimped red with silver edges
      for (let x = 0; x < 48; x++) p.R(x, 48, 1, 8, x % 2 ? PAL.red : PAL.silver, x % 2 ? 3 : 4);
      // the liner (56..64 strip unused) is painted in its own page
    });
    const L = tx('capLiner', 32, 32, (p) => {
      p.all(PAL.paper, 4.5); p.ellipse(16, 16, 15, 15, (nx, ny) => (Math.hypot(nx, ny) > 0.88 ? rgb(PAL.paper, 3) : null));
      p.text('WINNER', 5, 13, rgb(PAL.red, 3)); p.R(5, 19, 23, 1, PAL.red, 3);
    });
    const crimp = (v: THREE.Vector3) => { if (v.y < 0.035) { const a = Math.atan2(v.x, v.z), k = 1 + 0.07 * Math.cos(a * 21) * Math.min(1, (0.035 - v.y) / 0.06); v.x *= k; v.z *= k; } };
    const g = b.sub([0, 0, 0], [1.15, 0, 0.12]);
    g.add(warp(lathe([[0.38, -0.08], [0.35, 0.02], [0.31, 0.065], [0, 0.065]], 42, { side: T.r(0, 48, 48, 8), cap: T.r(0, 0, 48, 48) }), crimp), mat('cap', T, { rough: 0.3, metal: 0.35 }), [0, 0, 0], [0, 0, 0], 1.25);
    g.add(warp(lathe([[0, 0.045], [0.29, 0.045], [0.33, 0.0], [0.365, -0.08]], 42, { side: T.r(0, 48, 48, 8), cap: L.r(0, 0, 32, 32) }), crimp), mat('capIn', L, { rough: 0.7 }), [0, 0, 0], [0, 0, 0], 1.25);
    // the side it was levered on: a little bend
    g.add(cbox(0.06, 0.03, 0.02, 0.008), S.chrome(), [0.36, -0.06, 0.2]);
  },

  // ---------------------------------------------------------------- a rubber duck in profile: big orange beak, a dot eye
  rubberDuck(b) {
    const Y = PAL.yellow;
    const T = tx('duck', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) p.R(0, y, 32, 1, Y, y < 5 ? 5 : y < 18 ? 4 : y < 26 ? 3.5 : 3);
      p.R(0, 29, 32, 3, PAL.orange, 3.5);
      p.R(3, 3, 5, 3, PAL.white, 5);
    });
    const duck = mat('duck', T, { rough: 0.35 });
    b.add(ball(0.36, 12, 9), duck, [0.08, -0.16, 0], [0, 0, 0], [1.3, 0.78, 0.95], { smooth: 1.2 });
    b.add(hull([[0.42, -0.1, 0.12], [0.42, -0.1, -0.12], [0.58, 0.16, 0], [0.5, -0.24, 0.1], [0.5, -0.24, -0.1], [0.3, 0.02, 0.18], [0.3, 0.02, -0.18]]), duck, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.9 });
    b.add(ball(0.25, 12, 9), duck, [-0.2, 0.22, 0], [0, 0, 0], 1, { smooth: 1.2 });
    // the beak: a big flattened wedge, upper and lower mandibles
    const O = tx('beak', 16, 16, (p) => { p.all(PAL.orange, 3.5); p.R(0, 0, 16, 4, PAL.orange, 4.5); p.R(0, 12, 16, 4, PAL.orange, 2.5); p.R(2, 2, 4, 2, PAL.yellow, 5); });
    const beak = mat('beak', O, { rough: 0.35 });
    b.add(hull([[-0.38, 0.22, 0.13], [-0.38, 0.22, -0.13], [-0.38, 0.13, 0.12], [-0.38, 0.13, -0.12], [-0.66, 0.19, 0.06], [-0.66, 0.19, -0.06], [-0.62, 0.14, 0], [-0.4, 0.26, 0]]), beak, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.7 });
    b.add(hull([[-0.38, 0.12, 0.1], [-0.38, 0.12, -0.1], [-0.36, 0.06, 0.08], [-0.36, 0.06, -0.08], [-0.58, 0.12, 0.04], [-0.58, 0.12, -0.04]]), beak, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.7 });
    // eyes (both sides): black with a white glint
    const E = tx('duckEye', 8, 8, (p) => { p.all(PAL.ink, 0.5); p.R(1, 1, 3, 3, PAL.white, 5); });
    for (const z of [1, -1]) b.add(ball(0.06, 7, 5), mat('duckEye', E, { rough: 0.15 }), [-0.26, 0.32, z * 0.215], [0, z > 0 ? -0.6 : Math.PI + 0.6, 0], [1, 1.2, 0.6]);
    // the wing: a flattened teardrop on each side
    const wing: V2[] = [[0, 0.1], [0.2, 0.14], [0.34, 0.08], [0.42, -0.04], [0.3, -0.1], [0.1, -0.08], [-0.02, 0.0]];
    for (const z of [1, -1]) b.add(warp(ext(wing, 0.06, 0.025), (v) => { v.z *= 1 - v.x; }), duck, [0.06, -0.12, z * 0.29], [0, z > 0 ? 0 : Math.PI, z > 0 ? -0.15 : 0.15]);
  },

  // ---------------------------------------------------------------- a green bottle on its side, a rolled map inside, corked
  bottleMessage(b) {
    const G = tx('bottleGlass', 32, 32, (p) => {
      p.all(PAL.glass, 3);
      p.R(2, 0, 3, 32, PAL.glass, 5); p.R(5, 0, 1, 32, PAL.glass, 4); p.R(28, 0, 2, 32, PAL.glass, 4.5);
      p.R(0, 28, 32, 4, PAL.glass, 2);
    });
    const glass = mat('bottleGlass', G, { rough: 0.1, metal: 0.1, opacity: 0.5, emissive: '#2a6a5a', ek: 0.3, depthWrite: false });
    const bt = b.sub([-0.08, 0, 0], [0.1, 0.25, -Math.PI / 2 + 0.06]);
    bt.add(bottleGeo(0.3, 1.24, 0.1, 12), glass, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.8 });
    bt.add(cyl(0.1, 0.2, 8, { rTop: 0.115 }), corkMat(), [0, 0.74, 0]);
    // the rolled map, tied with red ribbon, a corner of ink showing
    const M2 = tx('scrollMap', 48, 16, (p) => {
      p.all(PAL.paper, 4); for (let x = 0; x < 48; x += 6) p.R(x, 0, 1, 16, PAL.paper, 3);
      p.R(0, 0, 48, 2, PAL.paper, 5); p.R(0, 14, 48, 2, PAL.paper, 2.5);
      for (let i = 0; i < 6; i++) { p.t(30 + i, 5 + i, PAL.red, 3); p.t(35 - i, 5 + i, PAL.red, 3); }
      p.ln(4, 8, 24, 6, PAL.ink, 2); p.ln(8, 11, 20, 12, PAL.ink, 2);
    });
    bt.add(cyl(0.13, 0.7, 8, { side: M2.r(0, 0, 48, 16), cap: M2.r(0, 14, 16, 2) }), mat('scrollMap', M2, { rough: 0.85 }), [0.03, -0.08, 0.02], [0.05, 0, -0.12]);
    bt.add(cyl(0.135, 0.06, 8), S.thread(), [0.03, -0.08, 0.02], [0.05, 0, -0.12]);
    bt.add(ball(0.05, 6, 4), mat('wax', tx('wax', 8, 8, (p) => { p.all(PAL.red, 3); p.R(1, 1, 3, 2, PAL.red, 4.5); }), { rough: 0.4 }), [0.16, -0.06, 0.06]);
    // a little sand that came in with it
    bt.add(warp(lathe([[0, -0.6], [0.25, -0.6], [0.27, -0.45], [0, -0.45]], 8), (v) => { if (v.x > 0.05) v.y += 0.0; v.x *= 0.95; if (v.x > 0.12) v.y -= 0.05; }), mat('sandPile', tx('sandPile', 16, 16, (p) => { p.all(PAL.sand, 3.5); p.R(0, 0, 16, 3, PAL.sand, 4.5); for (let i = 0; i < 6; i++) p.t(i * 3, 8 + (i % 3), PAL.sand, 2); }), { rough: 1 }), [0.2, 0, 0], [0, 0, 0], [0.6, 1, 0.6]);
  },

  // ---------------------------------------------------------------- a brass pocket compass, lid open, a sapphire on the crown
  compass(b) {
    const D = tx('compassDial', 48, 48, (p) => {
      p.ellipse(24, 24, 24, 24, (nx, ny) => rgb(PAL.paper, Math.hypot(nx, ny) > 0.92 ? 2.5 : 4.5));
      for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU, r0 = i % 4 ? 19 : 16; for (let r = r0; r < 21; r++) p.t(24 + Math.cos(a) * r, 24 + Math.sin(a) * r, PAL.ink, 2); }
      // the rose: four points
      p.poly([[24, 6], [27, 24], [24, 42], [21, 24]], rgb(PAL.paper, 3)); p.poly([[6, 24], [24, 21], [42, 24], [24, 27]], rgb(PAL.paper, 3));
      p.poly([[24, 6], [27, 24], [24, 24]], rgb(PAL.paper, 2)); p.poly([[42, 24], [24, 27], [24, 24]], rgb(PAL.paper, 2));
      p.text('N', 23, 1, rgb(PAL.red, 3)); p.text('S', 23, 42, rgb(PAL.ink, 2)); p.text('E', 43, 22, rgb(PAL.ink, 2)); p.text('W', 2, 22, rgb(PAL.ink, 2));
    });
    const brassT = tx('compassBrass', 48, 48, (p) => {
      p.metal(0, 0, 48, 48, PAL.brass, { b: 3, bands: false });
      // the lid's engraving: a ship's wheel and a rope ring
      p.ellipse(24, 24, 20, 20, (nx, ny) => (Math.abs(Math.hypot(nx, ny) - 0.9) < 0.06 ? rgb(PAL.brass, 1.5) : null));
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; p.ln(24, 24, 24 + Math.cos(a) * 12, 24 + Math.sin(a) * 12, PAL.brass, 1.5); p.t(24 + Math.cos(a) * 13, 24 + Math.sin(a) * 13, PAL.brass, 4.5); }
      p.ellipse(24, 24, 8, 8, (nx, ny) => (Math.abs(Math.hypot(nx, ny) - 0.85) < 0.15 ? rgb(PAL.brass, 1.5) : null));
      p.glint(12, 10, 2);
    });
    const brass = mat('compassBrass', brassT, { rough: 0.3, metal: 0.6 });
    const body = b.sub([0, -0.2, 0], [Math.PI / 2, 0, 0]);
    body.add(cyl(0.34, 0.14, 18, { ch: 0.04, side: brassT.r(0, 0, 48, 6), cap: brassT.r(0, 0, 48, 48) }), brass);
    body.add(cyl(0.29, 0.02, 18, { side: D.r(0, 0, 48, 2), cap: D.r(0, 0, 48, 48) }), mat('compassDial', D, { rough: 0.7 }), [0, 0.07, 0]);
    body.add(torus(0.3, 0.035, 4, 18), brass, [0, 0.08, 0], [Math.PI / 2, 0, 0]);
    // the needle: red north, steel south, a brass pin
    const N = tx('needle', 8, 16, (p) => { p.R(0, 0, 8, 8, PAL.red, 3.5); p.R(0, 8, 8, 8, PAL.silver, 4); p.R(0, 0, 4, 16, PAL.white, 5); p.R(0, 0, 4, 8, PAL.red, 4.5); });
    body.add(hull([[0, 0.1, -0.24], [0.045, 0.1, 0], [0, 0.1, 0.24], [-0.045, 0.1, 0], [0, 0.125, 0]], N.r(0, 0, 8, 16)), mat('needle', N, { rough: 0.3, metal: 0.3 }), [0, 0, 0], [0, 0.55, 0]);
    body.add(cyl(0.03, 0.06, 6), S.brassPin(), [0, 0.12, 0]);
    body.add(cyl(0.29, 0.015, 18), mat('compassGlass', tx('compassGlass', 16, 16, (p) => { p.all(PAL.ice, 4); p.R(2, 3, 6, 2, PAL.white, 5); p.R(3, 6, 3, 1, PAL.white, 5); }), { rough: 0.05, opacity: 0.25, depthWrite: false }), [0, 0.14, 0]);
    // the lid, hinged at the top and thrown back
    const lid = b.sub([0, 0.14, -0.03], [-0.35, 0, 0]);
    lid.add(cyl(0.33, 0.05, 18, { ch: 0.015, side: brassT.r(0, 0, 48, 6), cap: brassT.r(0, 0, 48, 48) }), brass, [0, 0.32, 0], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.05, 0.14, 6), brass, [0, 0.14, -0.03], [0, 0, Math.PI / 2]);
    // the crown + bail on the side, a sapphire set in the crown
    b.add(cyl(0.06, 0.1, 8), brass, [0.39, -0.2, 0], [0, 0, Math.PI / 2]);
    b.add(torus(0.08, 0.022, 4, 10), brass, [0.5, -0.2, 0], [0, Math.PI / 2, Math.PI / 2]);
    b.add(ball(0.045, 6, 4), mat('sapphire', tx('sapphire', 8, 8, (p) => { p.facets(0, 0, 8, 8, PAL.blue, 6); }), { rough: 0.1, emissive: '#2c62c4', ek: 0.6 }), [0.45, -0.2, 0.04]);
  },

  // ---------------------------------------------------------------- a cord necklace: bone and wood beads, a big tooth capped in gold
  sharkNecklace(b) {
    const cord = mat('cord', tx('cord', 32, 8, (p) => { p.rope(0, 0, 32, 8, PAL.leather, { pitch: 3 }); }), { rough: 0.85 });
    const pts: V3[] = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU; pts.push([Math.sin(a) * 0.88, 0.14 + Math.cos(a) * 0.24 - (Math.cos(a) < 0 ? Math.pow(-Math.cos(a), 3) * 0.12 : 0), Math.cos(a) * 0.06 - 0.05]); }
    b.add(tube(pts, 0.025, { closed: true, radial: 3, segs: 32 }), cord);
    const bone = mat('bead', tx('bead', 16, 8, (p) => { p.all(PAL.bone, 4); p.R(0, 0, 16, 2, PAL.bone, 5); p.R(0, 6, 16, 2, PAL.bone, 3); for (let x = 2; x < 16; x += 5) p.R(x, 3, 2, 2, PAL.leather, 2); }), { rough: 0.5 });
    const wood = mat('beadWood', tx('beadWood', 16, 8, (p) => { p.wood(0, 0, 16, 8, PAL.dark, { knots: 0, seed: 3 }); p.R(0, 0, 16, 1, PAL.dark, 5); }), { rough: 0.6 });
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const a = Math.PI + i * 0.2, x = Math.sin(a) * 0.88, y = 0.14 + Math.cos(a) * 0.24 - Math.pow(Math.max(0, -Math.cos(a)), 3) * 0.12;
      b.add(i % 2 ? cyl(0.06, 0.09, 6, { ch: 0.02 }) : ball(0.065, 6, 4), i % 2 ? bone : wood, [x, y, -0.1], [0, 0, Math.PI / 2 + i * 0.2]);
    }
    const { g, m } = toothPart();
    b.add(g, m, [0, -0.42, -0.04], [0.05, 0, Math.PI], 0.85);
    b.add(cyl(0.13, 0.12, 8, { ch: 0.025 }), S.gold(), [0, -0.12, -0.06], [0, 0, 0], [1.35, 1, 0.75]);
    b.add(torus(0.05, 0.016, 4, 8), S.gold(), [0, -0.04, -0.08]);
  },

  // ---------------------------------------------------------------- an anglerfish lure in a brass cage, its stalk curled into a handle
  anglerLantern(b) {
    const Gl = tx('esca', 32, 16, (p) => {
      p.all(PAL.venom, 4.5); p.R(0, 0, 32, 3, PAL.venom, 5); p.R(0, 12, 32, 4, PAL.venom, 3.5);
      for (let x = 0; x < 32; x += 4) p.R(x, 4, 1, 8, PAL.yellow, 5);
      p.R(5, 3, 4, 3, PAL.white, 5);
    });
    b.add(ball(0.26, 10, 8), mat('esca', Gl, { rough: 0.3, emissive: '#b8ff5a', ek: 1.3 }), [0, -0.42, 0], [0, 0, 0], 1, { smooth: 1.2 });
    const brassT = tx('lanternBrass', 32, 8, (p) => { p.all(PAL.brass, 3.5); p.R(0, 0, 32, 2, PAL.brass, 5); p.R(0, 6, 32, 2, PAL.brass, 1.5); for (let x = 3; x < 32; x += 8) p.rivet(x, 2, PAL.brass); });
    const brass = mat('lanternBrass', brassT, { rough: 0.3, metal: 0.6 });
    b.add(cyl(0.3, 0.1, 10, { ch: 0.03, rTop: 0.25 }), brass, [0, -0.78, 0]);
    b.add(torus(0.3, 0.025, 4, 12), brass, [0, -0.4, 0], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.18, 0.16, 10, { rTop: 0.07 }), brass, [0, -0.08, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.3; b.add(cyl(0.022, 0.66, 4), brass, [Math.cos(a) * 0.29, -0.43, Math.sin(a) * 0.29]); }
    // the stalk (illicium): mottled flesh, glowing freckles, curling over into a handle
    const St = tx('illicium', 64, 8, (p) => { p.all(PAL.flesh, 2); p.R(0, 1, 64, 2, PAL.flesh, 3); for (let x = 2; x < 64; x += 6) { p.t(x, 5, PAL.venom, 5); p.t(x + 3, 2, PAL.flesh, 0.5); } });
    b.add(tube([[0, -0.02, 0], [0, 0.3, 0], [0.04, 0.62, 0.02], [0.24, 0.84, 0.03], [0.4, 0.7, 0.02], [0.38, 0.5, 0], [0.28, 0.44, 0]], (t) => 0.06 - t * 0.032, { radial: 6, segs: 20 }), mat('illicium', St, { rough: 0.5, emissive: '#5ad040', ek: 0.4 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.9 });
  },

  // ---------------------------------------------------------------- an iridescent mermaid scale (and a smaller one behind)
  mermaidScale(b) {
    // three shingled scales, the front one big: an iridescent fan with a bright rim, growth ridges, a silver loop
    const outline: V2[] = [];
    for (let i = 0; i <= 12; i++) { const a = Math.PI * (0.05 + 0.9 * (i / 12)); outline.push([Math.cos(a) * 0.36, Math.sin(a) * 0.4 - 0.06]); }
    outline.push([-0.2, -0.3], [0, -0.42], [0.2, -0.3]);
    outline.reverse();
    const W = 40, H = 48, f = pageMap(outline, W, H);
    const T = tx('mScale', W, H, (p) => {
      const bands: Pal[] = [PAL.teal, PAL.aqua, PAL.blue, PAL.purple, PAL.pink];
      const [cx, cy] = f([0, -0.42]);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d = Math.hypot(x - cx, (y - cy) * 0.85), k = Math.min(4.99, d / 9 + (x / W) * 0.8); p.t(x, y, bands[Math.floor(k)], 3.5 + ((d % 5) < 1 ? -1 : (d % 5) < 2 ? 1 : 0)); }
      const ring = f.poly(outline);
      for (let i = 0; i < ring.length; i++) { const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length]; p.ln(x0, y0, x1, y1, PAL.white, 5); }
      p.R(9, 9, 7, 2, PAL.white, 5); p.R(8, 11, 2, 4, PAL.white, 5); p.glint(11, 10, 2);
    });
    const m = mat('mScale', T, { rough: 0.15, metal: 0.35, emissive: '#26a296', ek: 0.35 });
    const cup = (v: THREE.Vector3) => { v.z += -0.14 * (v.x * v.x * 6) + 0.08 * (v.y + 0.42); };
    const sc = (pos: V3, rot: V3, s: number) => b.add(warp(ext(outline, 0.06, 0.02, { rects: { pz: T.r(0, 0, W, H), nz: T.r(0, 0, W, H), side: T.r(0, 0, W, 3) } }), cup), m, pos, rot, s);
    sc([-0.18, 0.2, -0.12], [0.1, 0.2, 0.3], 0.62);
    sc([0.2, 0.18, -0.1], [0.1, -0.2, -0.3], 0.62);
    sc([0.0, -0.02, 0.06], [0.15, 0, 0], 1);
    b.add(torus(0.045, 0.016, 4, 8), S.chrome(), [0, -0.44, 0.08]);
  },

  // ---------------------------------------------------------------- a lucky starfish: five puffy arms of tubercles
  starfish(b) {
    const out: V2[] = [];
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i / 5) * TAU, a2 = a + TAU / 10;
      out.push([Math.cos(a - 0.08) * 0.47, Math.sin(a - 0.08) * 0.47], [Math.cos(a) * 0.5, Math.sin(a) * 0.5], [Math.cos(a + 0.08) * 0.47, Math.sin(a + 0.08) * 0.47], [Math.cos(a2) * 0.17, Math.sin(a2) * 0.17]);
    }
    const W = 48, H = 48, f = pageMap(out, W, H);
    const O = PAL.orange;
    const T = tx('starfish', W, H, (p) => {
      p.all(O, 3);
      const [cx, cy] = f([0, 0]);
      for (let i = 0; i < 5; i++) {
        const a = Math.PI / 2 + (i / 5) * TAU;
        for (let r = 0.06; r < 0.45; r += 0.065) for (const side of [-1, 0, 1]) {
          const w = 0.07 * (1 - r) * side, [x, y] = f([Math.cos(a) * r - Math.sin(a) * w, Math.sin(a) * r + Math.cos(a) * w]);
          p.t(x, y, O, 5); p.t(x + 1, y + 1, O, 1.5); if (side === 0) p.t(x - 1, y, O, 4);
        }
      }
      p.ellipse(cx, cy, 4, 4, rgb(PAL.red, 2.5)); p.t(cx - 1, cy - 1, PAL.yellow, 5);
    });
    b.add(warp(ext(out, 0.16, 0.05, { rects: { pz: T.r(0, 0, W, H), side: T.r(0, 0, W, H), nz: T.r(0, 0, W, H) } }), (v) => { const r = Math.hypot(v.x, v.y); if (v.z > 0) v.z *= 1.4 - r * 1.6; v.z += r * r * 0.5; }), mat('starfish', T, { rough: 0.6 }), [0, -0.02, 0], [-0.25, 0, 0.2], 1, { smooth: 0.5 });
  },

  // ---------------------------------------------------------------- a big red crab claw, pincers open, black tips
  crabClaw(b) {
    const C = tx('crabShell', 32, 32, (p) => {
      p.all(PAL.red, 3.5);
      p.R(0, 0, 32, 6, PAL.red, 4.5); p.R(0, 24, 32, 8, PAL.orange, 4);
      for (let y = 3; y < 24; y += 5) for (let x = (y % 10 === 3 ? 1 : 4); x < 32; x += 6) { p.t(x, y, PAL.white, 5); p.t(x + 1, y + 1, PAL.red, 1.5); }
    });
    const shell = mat('crabShell', C, { rough: 0.45 });
    const Tip = tx('clawTip', 32, 8, (p) => { p.R(0, 0, 20, 8, PAL.red, 3.5); p.R(20, 0, 12, 8, PAL.black, 2); p.R(20, 1, 12, 2, PAL.black, 4.5); p.R(18, 0, 2, 8, PAL.black, 3); });
    const tipM = mat('clawTip', Tip, { rough: 0.3 });
    // the palm
    b.add(ball(0.3, 10, 7), shell, [-0.08, -0.12, 0], [0, 0, 0.5], [1.15, 0.85, 0.65], { smooth: 0.8 });
    // the fixed finger and the hinged one, teeth along the bite
    b.add(tube([[0.12, 0.0, 0], [0.32, 0.12, 0], [0.42, 0.3, 0], [0.4, 0.46, 0]], (t) => 0.13 * (1 - t * 0.85), { radial: 6, segs: 10, uv: Tip.r(0, 0, 32, 8) }), tipM, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.6 });
    b.add(tube([[-0.02, 0.12, 0], [0.0, 0.34, 0], [0.12, 0.5, 0], [0.26, 0.56, 0]], (t) => 0.11 * (1 - t * 0.85), { radial: 6, segs: 10, uv: Tip.r(0, 0, 32, 8) }), tipM, [0, 0, 0.02], [0, 0, 0], 1, { smooth: 0.6 });
    for (const [x, y, a] of [[0.33, 0.22, 2.3], [0.37, 0.33, 2.3], [0.08, 0.36, -0.6], [0.14, 0.45, -0.9]] as V3[]) b.add(cone(0.03, 0.08, 4), mat('crabTooth', tx('crabTooth', 4, 4, (p) => p.all(PAL.bone, 4.5)), { rough: 0.5 }), [x, y, 0], [0, 0, a]);
    // the snapped joint: a stub of arm with pale meat showing
    b.add(cyl(0.14, 0.18, 8, { ch: 0.03 }), shell, [-0.36, -0.36, 0], [0, 0, 0.8]);
    b.add(cyl(0.11, 0.02, 8), mat('crabMeat', tx('crabMeat', 16, 16, (p) => { p.all(PAL.white, 4.5); p.ellipse(8, 8, 6, 6, (nx, ny) => rgb(PAL.pink, Math.hypot(nx, ny) > 0.6 ? 4.5 : 4)); }), { rough: 0.7 }), [-0.43, -0.43, 0], [0, 0, 0.8]);
  },

  // ---------------------------------------------------------------- the classic catch: a lace-up leather boot, nails in the sole, weed in the laces
  oldBoot(b) {
    const Lp = PAL.leather;
    const T = tx('boot', 64, 64, (p) => {
      p.all(Lp, 3);
      for (let y = 0; y < 64; y += 2) for (let x = (y % 4) ? 1 : 0; x < 64; x += 4) p.t(x, y, Lp, 3.5);
      p.creases(0, 30, 64, 20, Lp, 9, 4);
      p.stitch(2, 2, 61, 2, '#e8c890', '#1e0c06'); p.stitch(2, 61, 61, 61, '#e8c890', '#1e0c06'); p.stitch(2, 2, 2, 61, '#e8c890', '#1e0c06');
      for (const [x, y, w, h] of [[40, 12, 10, 6], [12, 44, 8, 5]] as number[][]) { p.R(x, y, w, h, Lp, 4.5); p.R(x, y + h, w, 1, Lp, 1.5); }
      p.rust(52, 50, 4, 2, pal('#3a6a3a'));
    });
    const leather = mat('boot', T, { rough: 0.7 });
    // the shaft
    const shaft: V3[] = [];
    for (const [y, x0, x1, z] of [[-0.45, -0.82, -0.12, 0.27], [0.92, -0.88, -0.06, 0.29]] as number[][]) for (const zz of [-z, z]) shaft.push([x0, y, zz], [x1, y, zz], [x0 + 0.05, y, zz * 1.12], [x1 - 0.05, y, zz * 1.12]);
    b.add(hull(shaft, { pz: T.r(0, 0, 64, 64), nz: T.r(0, 0, 64, 64), side: T.r(0, 0, 32, 64) }), leather, [0, 0, 0], [0, 0, 0.04]);
    // the foot with a rounded toe cap
    const foot: V3[] = [];
    for (const z of [-0.29, 0.29]) foot.push([-0.84, -0.88, z], [-0.84, -0.2, z], [-0.1, -0.3, z], [0.3, -0.5, z * 0.95]);
    for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI; for (const z of [-0.26, 0.26]) foot.push([0.62 + Math.cos(a) * 0.3, -0.62 + Math.sin(a) * 0.26, z * (0.7 + 0.3 * Math.cos(a))]); }
    b.add(hull(foot, { pz: T.r(0, 32, 64, 32), nz: T.r(0, 32, 64, 32), side: T.r(32, 32, 32, 32), py: T.r(0, 0, 64, 32) }), leather, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.45 });
    // the sole and heel, studded with nails
    const So = tx('sole', 64, 16, (p) => { p.all(PAL.dark, 2); p.R(0, 0, 64, 2, PAL.dark, 3.5); for (let x = 3; x < 64; x += 6) { p.t(x, 8, PAL.steel, 4.5); p.t(x + 1, 9, PAL.steel, 2); } p.R(0, 14, 64, 2, PAL.dark, 1); });
    b.add(cbox(1.86, 0.1, 0.64, 0.035, { side: So.r(0, 0, 64, 16), pz: So.r(0, 0, 64, 16), py: So.r(0, 0, 64, 16) }), mat('sole', So, { rough: 0.85 }), [0.06, -0.93, 0]);
    b.add(cbox(0.38, 0.12, 0.6, 0.03, So.r(0, 0, 16, 16)), mat('sole', So), [-0.66, -1.03, 0]);
    // the collar opening and tongue
    b.add(cbox(0.8, 0.06, 0.56, 0.02, { py: [0, 0, 0.1, 0.1] }), S.dark(), [-0.47, 0.94, 0]);
    b.add(cbox(0.24, 0.5, 0.36, 0.05), leather, [-0.1, 0.84, 0], [0, 0, -0.35]);
    // eyelets and laces up the front
    const lace = mat('lace', tx('lace', 16, 4, (p) => { p.all(PAL.paper, 3.5); p.R(0, 0, 16, 1, PAL.paper, 5); }), { rough: 0.8 });
    for (let i = 0; i < 5; i++) {
      const y = -0.3 + i * 0.24, x = -0.12 + i * 0.012;
      for (const z of [-0.22, 0.22]) b.add(torus(0.035, 0.012, 3, 6), S.brass(), [x + 0.02, y, z], [0, Math.PI / 2, 0]);
      if (i < 4) { b.add(tube([[x + 0.03, y, -0.22], [x + 0.06, y + 0.12, 0], [x + 0.04, y + 0.24, 0.22]], 0.018, { radial: 3, segs: 4 }), lace); b.add(tube([[x + 0.03, y, 0.22], [x + 0.07, y + 0.12, 0], [x + 0.04, y + 0.24, -0.22]], 0.018, { radial: 3, segs: 4 }), lace); }
    }
    b.add(tube([[-0.05, 0.86, 0.22], [0.12, 0.8, 0.26], [0.18, 0.6, 0.28], [0.12, 0.45, 0.3]], 0.018, { radial: 3, segs: 8 }), lace);
    // weed caught in it
    const weed = mat('kelpBladeW', tx('weedStrand', 8, 32, (p) => { p.all(PAL.kelp, 3); p.R(0, 0, 8, 2, PAL.kelp, 4.5); p.R(3, 0, 1, 32, PAL.kelp, 4.5); }), { rough: 0.7, side: THREE.DoubleSide });
    b.add(surf(1, 5, (u, v) => [-0.7 + u * 0.08 + Math.sin(v * 5) * 0.05, 0.9 - v * 0.75, 0.31]), weed);
    b.add(surf(1, 4, (u, v) => [-0.45 + u * 0.07 + Math.sin(v * 6 + 1) * 0.04, 0.9 - v * 0.5, 0.31]), weed);
  },

  // ---------------------------------------------------------------- a spiral whelk: whorls round a spire, a pink aperture
  spiralShell(b) {
    const T = tx('whelk', 48, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
        const k = (((x / 48) - (1 - y / 48) * 4.2) % 1 + 1) % 1;
        p.t(x, y, PAL.bone, k < 0.08 ? 1.5 : k < 0.22 ? 4.5 : k > 0.8 ? 3 : 4);
        if (k > 0.3 && k < 0.7 && (x + Math.floor(y / 3)) % 7 === 0) p.t(x, y, PAL.leather, 2.5);
      }
      p.R(0, 42, 48, 6, PAL.bone, 3);
    });
    // a spindle (spire up, body whorl, siphonal canal) with whorl steps carved into it along a helix
    const prof: V2[] = [[0, -0.62], [0.05, -0.56], [0.1, -0.36], [0.27, -0.12], [0.31, 0.04], [0.26, 0.2], [0.18, 0.36], [0.1, 0.5], [0.0, 0.66]];
    const g = warp(lathe(prof, 14, { side: T.r(0, 0, 48, 48) }), (v) => {
      const a = Math.atan2(v.x, v.z) / TAU, t = ((a - (v.y + 0.62) / 1.28 * 4.2) % 1 + 1) % 1;
      const k = 1 + 0.16 * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) - 0.08;
      v.x *= k; v.z *= k;
    });
    const sh = b.sub([0, 0, 0], [0.3, 0.6, 0.55]);
    sh.add(g, mat('whelk', T, { rough: 0.5 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.5 });
    // the aperture: a flared, glossy pink lip on the body whorl
    const L = tx('whelkLip', 16, 32, (p) => { p.all(PAL.pink, 4); p.R(5, 4, 6, 24, PAL.pink, 2); p.R(6, 6, 3, 18, PAL.pink, 1.5); p.R(1, 2, 2, 20, PAL.white, 5); });
    const lip: V2[] = [[0, 0.24], [0.14, 0.18], [0.2, 0.0], [0.17, -0.24], [0.08, -0.46], [0.0, -0.5], [-0.05, -0.3], [-0.04, 0.0]];
    sh.add(ext(lip, 0.05, 0.015, { rects: L.r(0, 0, 16, 32) }), mat('whelkLip', L, { rough: 0.25, emissive: '#963456', ek: 0.15 }), [0.12, -0.06, 0.24], [0, -0.35, 0]);
  },

  // ---------------------------------------------------------------- a chipped porcelain teacup on its saucer: willow pattern, gold rim, tea
  teacup(b) {
    const P = tx('porcelain', 64, 32, (p) => {
      p.all(PAL.white, 4.5);
      p.R(0, 0, 64, 2, PAL.gold, 4.5); p.R(0, 2, 64, 1, PAL.gold, 2.5);
      for (let x = 0; x < 64; x++) { const y = 12 + Math.round(Math.sin(x * 0.4) * 2); p.t(x, y, PAL.blue, 3); p.t(x, y + 1, PAL.blue, 2); }
      for (let x = 4; x < 64; x += 12) { p.R(x, 16, 5, 4, PAL.blue, 3); p.R(x + 2, 14, 1, 2, PAL.blue, 2); p.t(x + 6, 18, PAL.blue, 3); }
      p.R(0, 28, 64, 4, PAL.white, 3.5);
      p.poly([[40, 0], [46, 0], [43, 5]], rgb(PAL.bone, 3)); p.t(43, 5, PAL.bone, 1.5);
    });
    const china = mat('porcelain', P, { rough: 0.2 });
    const g = b.sub([0, 0, 0], [0.38, 0, 0]);
    g.add(lathe([[0, -0.22], [0.16, -0.22], [0.19, -0.19], [0.3, 0.02], [0.36, 0.2], [0.33, 0.2], [0.27, 0.0], [0, -0.17]], 14, { side: P.r(0, 0, 64, 32) }), china, [0, 0.0, 0], [0, 0, 0], 1, { smooth: 0.6 });
    g.add(cyl(0.31, 0.01, 14, { side: [0, 0, 1, 1] }), mat('tea', tx('tea', 16, 16, (p) => { p.all(PAL.leather, 3.5); p.ellipse(8, 8, 7, 7, (nx, ny) => rgb(PAL.leather, Math.hypot(nx, ny) > 0.8 ? 4.5 : 3.5)); p.R(4, 4, 4, 1, PAL.leather, 5); }), { rough: 0.1 }), [0, 0.13, 0]);
    g.add(torus(0.1, 0.03, 4, 10, Math.PI * 1.3), china, [0.36, 0.0, 0], [0, 0, -Math.PI * 0.65]);
    const Sc = tx('saucer', 48, 48, (p) => { p.ellipse(24, 24, 24, 24, (nx, ny) => { const d = Math.hypot(nx, ny); return rgb(d > 0.9 ? PAL.gold : d > 0.6 && d < 0.68 ? PAL.blue : PAL.white, d > 0.9 ? 4 : d > 0.6 && d < 0.68 ? 3 : 4.5); }); });
    g.add(lathe([[0, -0.32], [0.2, -0.32], [0.24, -0.29], [0.52, -0.22], [0.55, -0.19], [0.5, -0.2], [0.22, -0.26], [0, -0.26]], 16, { side: Sc.r(0, 22, 48, 4), cap: Sc.r(0, 0, 48, 48) }), mat('saucer', Sc, { rough: 0.2 }), [0, 0, 0]);
    g.add(hull([[0, 0, 0], [0.06, 0.01, 0.02], [0.03, 0.04, -0.02], [0.05, -0.01, -0.03]]), china, [0.32, -0.21, 0.28]);
  },
};
