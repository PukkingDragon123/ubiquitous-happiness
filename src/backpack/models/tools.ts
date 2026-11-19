// TOOLS: fishing gear turned buffs. Scissors, whetstone, sinker, bobber, lure, gear, grapple, net, tackle box, rod tip,
// pliers, spinner, fillet knife, harpoon head, can of worms, line spool.
import * as THREE from 'three';
import { mat, cbox, hull, cyl, cone, tube, ext, ball, surf, warp, torus, lathe, oval, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, tc, type Pal } from './paint';
import { brilliant, treble, coil } from './parts';
import type { Build } from './types';
import { S } from './shared';

const rgb = (p: Pal, t: number) => tc(p, t);

/** a steel blade page: brushed, a bright honed edge along the bottom, rust near the heel, two scratches */
function bladePage(key: string, P: Pal, o: { rust?: boolean; etch?: (p: import('./paint').Pt) => void; w?: number; h?: number } = {}) {
  const W = o.w ?? 64, H = o.h ?? 16;
  return tx('blade:' + key, W, H, (p) => {
    p.metal(0, 0, W, H, P, { b: 3 });
    p.R(0, H - 3, W, 2, P, 5); p.R(0, H - 1, W, 1, P, 1.5); p.R(0, 0, W, 1, P, 4);
    p.scratch(W * 0.4, 4, 8, P, 0.15); p.scratch(W * 0.62, 7, 6, P, -0.1);
    if (o.rust) { p.rust(6, 6, 4, 1); p.rust(16, 9, 3, 2); p.drip(7, 9, 4); }
    o.etch?.(p);
  });
}

export const TOOL_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- rusty scissors, open: big finger loops, a brass pivot
  scissors(b) {
    const bl = bladePage('sci', PAL.steel, { rust: true });
    const steel = mat('blade:sci', bl, { rough: 0.4, metal: 0.55 });
    const L = tx('sciLoop', 32, 32, (p) => {
      p.all(PAL.red, 3);
      p.R(0, 0, 32, 6, PAL.red, 4); p.R(0, 0, 6, 32, PAL.red, 3.5); p.R(0, 26, 32, 6, PAL.red, 2); p.R(26, 0, 6, 32, PAL.red, 2);
      p.R(8, 3, 10, 2, PAL.red, 5);
      for (const [x, y, w] of [[20, 20, 6], [4, 14, 4]] as V3[]) { p.R(x, y, w, 2, PAL.steel, 3); p.R(x, y, w, 1, PAL.steel, 4.5); }
    });
    const loop = mat('sciLoop', L, { rough: 0.45 });
    const brass = S.brassPin();
    const half = (s: 1 | -1) => {
      const h = b.sub([-0.12, 0, s * 0.03], [0, 0, s * 0.2]);
      const blade: V2[] = [[-0.08, 0.06 * s], [0.25, 0.085 * s], [0.7, 0.06 * s], [1.08, 0.0], [0.72, -0.025 * s], [0.2, -0.04 * s], [-0.08, -0.05 * s], [-0.3, -0.12 * s], [-0.36, -0.06 * s]];
      if (s < 0) blade.reverse();
      h.add(ext(blade, 0.05, 0.014, { rects: { pz: bl.r(0, 0, 64, 16), nz: bl.r(0, 0, 64, 16), side: bl.r(0, 13, 64, 3) } }), steel);
      const ring = oval(0, 0, 0.24, 0.16, 12), hole = oval(0, 0, 0.15, 0.085, 10).reverse();
      h.add(ext(ring, 0.1, 0.03, { holes: [hole] }), loop, [-0.5, -0.2 * s, 0], [0, 0, s * -0.25]);
    };
    half(1); half(-1);
    b.add(cyl(0.06, 0.16, 8, { ch: 0.02 }), brass, [-0.12, 0, 0], [Math.PI / 2, 0, 0]);
  },

  // ---------------------------------------------------------------- a two-grit whetstone in its oak case, oil sheen
  whetstone(b) {
    const W = tx('whetCase', 96, 32, (p) => {
      p.wood(0, 0, 96, 32, PAL.oak, { seed: 7, knots: 2 });
      p.panel(0, 0, 96, 32, PAL.oak, 3, { noFill: true, e: 2 });
      p.R(30, 10, 36, 12, PAL.oak, 1.5); p.text('KEEN', 34, 12, rgb(PAL.paper, 4)); p.text('EDGE', 50, 12, rgb(PAL.paper, 4)); p.R(30, 19, 36, 1, PAL.paper, 3);
    });
    const ST = tx('whetStone', 64, 32, (p) => {
      p.stone(0, 0, 32, 16, pal('#56606e'), { cell: 4, seed: 3, cracks: 0 }); p.stone(32, 0, 32, 16, pal('#56606e'), { cell: 4, seed: 4, cracks: 0 });
      for (let y = 0; y < 16; y++) for (let x = 32; x < 64; x++) p.t(x, y, pal('#c8783a'), 3.5 + ((x * 3 + y * 7) % 11 === 0 ? -1 : 0) + (y < 2 ? 1 : 0));
      p.R(31, 0, 2, 16, PAL.ink, 1.5);
      for (let y = 16; y < 32; y++) for (let x = 0; x < 64; x++) p.t(x, y, pal('#c8783a'), 3 + ((x * 3 + y * 7) % 11 === 0 ? -1 : 0));
      p.R(0, 15, 64, 2, PAL.ink, 2); p.R(0, 16, 64, 1, pal('#c8783a'), 4.5);
      p.ellipse(40, 24, 10, 3, (nx) => rgb(pal('#c8783a'), nx < -0.2 ? 5 : 4));
      p.R(10, 6, 30, 1, pal('#56606e'), 5);
    });
    const g = b.sub([0, 0, 0], [0.65, 0, 0]);
    g.add(cbox(1.8, 0.26, 0.62, 0.04, { side: W.r(0, 0, 96, 32), py: W.r(0, 0, 96, 32) }), mat('whetCase', W, { rough: 0.8 }), [0, -0.1, 0]);
    g.add(warp(cbox(1.6, 0.22, 0.46, 0.03, { pz: ST.r(0, 0, 64, 32), nz: ST.r(0, 0, 64, 32), py: ST.r(0, 0, 64, 16), side: ST.r(0, 0, 64, 32) }), (v) => { if (v.y > 0) v.y -= 0.03 * Math.cos(v.x * 1.8); }), mat('whetStone', ST, { rough: 0.6 }), [0, 0.06, 0]);
    g.add(ball(0.06, 6, 3), mat('whetOil', tx('whetOil', 8, 8, (p) => { p.all(PAL.yellow, 3); p.R(1, 1, 3, 2, PAL.yellow, 5); }), { rough: 0.1, emissive: '#7a4c06', ek: 0.4 }), [-0.45, 0.17, 0.06], [0, 0, 0], [1.6, 0.25, 1]);
  },

  // ---------------------------------------------------------------- a bell sinker with a brass swivel, stamped 2 OZ
  leadSinker(b) {
    const T = tx('sinker', 48, 32, (p) => {
      for (let y = 0; y < 32; y++) p.R(0, y, 48, 1, PAL.lead, y < 6 ? 5 : y > 26 ? 3 : 4);
      p.text('2OZ', 8, 16, rgb(PAL.lead, 1.5), rgb(PAL.lead, 5)); p.text('2OZ', 32, 16, rgb(PAL.lead, 1.5), rgb(PAL.lead, 5));
      for (const [x, y] of [[30, 12], [33, 13], [36, 12]] as V2[]) { p.t(x, y, PAL.lead, 1); p.t(x, y + 1, PAL.lead, 4.5); }
      p.scratch(26, 22, 10, PAL.lead, -0.2); p.R(4, 3, 8, 2, PAL.lead, 5);
    });
    b.add(lathe([[0, -0.36], [0.24, -0.35], [0.31, -0.22], [0.3, -0.02], [0.2, 0.18], [0.1, 0.3], [0.06, 0.34], [0, 0.36]], 10), mat('sinker', T, { rough: 0.55, metal: 0.3 }), [0, -0.08, 0], [0.25, 0, 0], 1, { smooth: 0.6 });
    const brass = S.brass();
    b.add(cyl(0.045, 0.12, 6), brass, [0, 0.33, 0.05]);
    b.add(torus(0.065, 0.022, 4, 8), brass, [0, 0.45, 0.05]);
    b.add(torus(0.05, 0.018, 4, 8), brass, [0, 0.55, 0.05], [0, Math.PI / 2, 0]);
    b.add(tube([[0, 0.6, 0.05], [0.08, 0.66, 0.08], [0.22, 0.62, 0.1], [0.32, 0.5, 0.08]], 0.012, { radial: 3, segs: 8 }), S.line());
  },

  // ---------------------------------------------------------------- a classic red-and-white float on a quill
  corkBobber(b) {
    const T = tx('bobber', 48, 48, (p) => {
      p.R(0, 0, 48, 22, PAL.red, 3.5); p.R(0, 2, 48, 3, PAL.red, 5); p.R(0, 18, 48, 4, PAL.red, 2.5);
      p.R(0, 22, 48, 4, PAL.ink, 2); p.R(0, 22, 48, 1, PAL.ink, 4);
      p.R(0, 26, 48, 22, PAL.white, 4); p.R(0, 42, 48, 6, PAL.white, 3);
      for (let y = 30; y < 46; y += 4) for (let x = (y % 8) / 2; x < 48; x += 6) p.t(x, y, PAL.white, 2.5);
      p.R(6, 4, 3, 10, PAL.red, 5); p.glint(7, 6, 1);
    });
    b.add(lathe([[0, -0.42], [0.12, -0.36], [0.24, -0.16], [0.28, 0.02], [0.26, 0.1], [0.2, 0.26], [0.1, 0.38], [0, 0.42]], 12), mat('bobber', T, { rough: 0.35 }), [0, 0.05, 0], [0, 0, 0], 1, { smooth: 0.7 });
    const quill = mat('quill', tx('quill', 8, 32, (p) => { p.all(PAL.bone, 4); p.R(0, 0, 8, 8, PAL.orange, 4); p.R(0, 0, 8, 2, PAL.yellow, 5); p.R(0, 26, 8, 6, PAL.bone, 3); p.R(1, 0, 1, 32, PAL.bone, 5); }), { rough: 0.4, emissive: '#c84a10', ek: 0.15 });
    b.add(cyl(0.035, 1.7, 6, { rTop: 0.025 }), quill, [0, 0.0, 0]);
    b.add(cyl(0.05, 0.12, 6), S.thread(), [0, -0.66, 0]);
    b.add(tube([[0, -0.68, 0.04], [0.1, -0.74, 0.06], [0.18, -0.84, 0.04], [0.22, -0.96, 0]], 0.014, { radial: 3, segs: 8 }), S.line());
  },

  // ---------------------------------------------------------------- a gold crankbait with a diving lip, trebles and a wink
  luckyLure(b) {
    const G = PAL.gold;
    const T = tx('lure', 64, 32, (p) => {
      // u around: 0 = the flank facing us, 16 = belly, 32 = far flank, 48 = back
      for (let x = 0; x < 64; x++) { const k = Math.cos(((x - 48) / 64) * TAU); for (let y = 0; y < 32; y++) p.t(x, y, k > 0.6 ? PAL.green : k < -0.6 ? PAL.yellow : G, k > 0.6 ? 2.5 : k < -0.6 ? 4.5 : 3.5); }
      for (let y = 2; y < 30; y += 4) for (let x = (y % 8 === 2 ? 0 : 3); x < 64; x += 6) { p.t(x, y, G, 2); p.t(x + 1, y + 1, G, 2); p.t(x + 2, y + 1, G, 2); p.t(x + 1, y, G, 5); }
      p.R(0, 23, 64, 2, PAL.red, 3); p.R(4, 22, 6, 1, PAL.red, 4.5);
      p.R(0, 0, 64, 3, G, 2); p.glint(6, 14, 1); p.glint(38, 10, 1);
    });
    const body = b.sub([0.02, 0.06, 0], [0, 0, -Math.PI / 2]);
    body.add(warp(lathe([[0, -0.66], [0.08, -0.6], [0.18, -0.36], [0.24, -0.06], [0.24, 0.18], [0.19, 0.4], [0.1, 0.56], [0, 0.62]], 10, { side: T.r(0, 0, 64, 32) }), (v) => { v.z *= 0.62; }), mat('lure', T, { rough: 0.28, metal: 0.55, emissive: '#7a4006', ek: 0.15 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.55 });
    // the diving lip, clear amber plastic
    const lip = mat('lureLip', tx('lureLip', 16, 16, (p) => { p.all(PAL.orange, 4); p.R(2, 2, 12, 2, PAL.yellow, 5); p.R(0, 14, 16, 2, PAL.orange, 2.5); }), { rough: 0.15, opacity: 0.75, emissive: '#b04a10', ek: 0.3 });
    b.sub([0.6, -0.06, 0], [0, 0, -0.75]).add(ext([[-0.14, 0], [0.14, 0], [0.2, 0.32], [0, 0.46], [-0.2, 0.3]], 0.035, 0.012), lip, [0, 0, 0], [Math.PI / 2, 0, -Math.PI / 2]);
    // eyes: the near one winks
    const eye = (wink: boolean) => tx(wink ? 'lureWink' : 'lureEye', 16, 16, (p) => {
      p.all(PAL.yellow, 4); p.ellipse(8, 8, 7, 7, (nx, ny) => rgb(PAL.yellow, nx + ny < -0.5 ? 5 : 4));
      if (wink) { for (let x = 3; x < 13; x++) p.R(x, 8 + Math.round(Math.abs(x - 8) * 0.35), 1, 2, PAL.ink, 0); }
      else { p.ellipse(9, 9, 4, 4, rgb(PAL.ink, 0)); p.R(7, 6, 2, 2, PAL.white, 5); }
    });
    b.add(ball(0.075, 8, 6, [0, 0, 1, 1]), mat('lureWink', eye(true), { rough: 0.25 }), [0.4, 0.12, 0.1], [0, -0.3, 0], [1, 1, 0.5]);
    b.add(ball(0.075, 8, 6), mat('lureEye', eye(false), { rough: 0.25 }), [0.4, 0.12, -0.1], [0, Math.PI + 0.3, 0], [1, 1, 0.5]);
    const wire = S.wire();
    b.add(torus(0.04, 0.012, 3, 8), wire, [0.86, -0.18, 0]);
    treble(b, wire, [0.22, -0.2, 0], 1.25);
    treble(b, wire, [-0.4, -0.15, 0], 1.25);
    b.add(torus(0.045, 0.012, 3, 8), wire, [-0.68, 0.06, 0]);
  },

  // ---------------------------------------------------------------- a brass spur gear with a steel pinion behind
  reelGear(b) {
    const gearOutline = (n: number, rr: number, rt: number): V2[] => {
      const out: V2[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, s = TAU / n;
        out.push([Math.cos(a) * rr, Math.sin(a) * rr], [Math.cos(a + s * 0.18) * rt, Math.sin(a + s * 0.18) * rt], [Math.cos(a + s * 0.45) * rt, Math.sin(a + s * 0.45) * rt], [Math.cos(a + s * 0.62) * rr, Math.sin(a + s * 0.62) * rr]);
      }
      return out;
    };
    const T = tx('gear', 48, 48, (p) => {
      p.metal(0, 0, 48, 48, PAL.brass, { b: 3, bands: false });
      for (const r of [8, 13, 18]) p.ellipse(24, 24, r, r, (nx, ny) => (Math.hypot(nx, ny) > 0.9 ? rgb(PAL.brass, nx + ny < 0 ? 4.5 : 2) : null));
      p.text('NO7', 18, 34, rgb(PAL.brass, 1.5), rgb(PAL.brass, 4.5));
      p.rust(36, 12, 3, 4, PAL.patina);
      p.glint(12, 10, 2);
    });
    const brass = mat('gear', T, { rough: 0.3, metal: 0.6 });
    const holes = [0, 1, 2, 3].map((i) => oval(Math.cos(i * TAU / 4 + 0.78) * 0.2, Math.sin(i * TAU / 4 + 0.78) * 0.2, 0.065, 0.065, 5).reverse());
    holes.push(oval(0, 0, 0.055, 0.055, 6).reverse());
    b.add(ext(gearOutline(12, 0.36, 0.45), 0.12, 0.02, { holes, rects: { pz: T.r(0, 0, 48, 48), nz: T.r(0, 0, 48, 48), side: T.r(0, 0, 48, 4) } }), brass, [0.04, 0.04, 0.04]);
    const PN = tx('pinion', 24, 24, (p) => { p.metal(0, 0, 24, 24, PAL.steel, { b: 3 }); p.ellipse(12, 12, 6, 6, (nx, ny) => (Math.hypot(nx, ny) > 0.8 ? rgb(PAL.steel, 1.5) : null)); });
    b.add(ext(gearOutline(8, 0.17, 0.23), 0.1, 0, { rects: PN.r(0, 0, 24, 24) }), mat('pinion', PN, { rough: 0.35, metal: 0.6 }), [-0.24, -0.22, -0.09]);
    b.add(cyl(0.055, 0.32, 6, { ch: 0.01 }), mat('pinion', PN), [0.04, 0.04, 0.0], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.08, 0.05, 6, { ch: 0.01 }), mat('pinion', PN), [0.04, 0.04, 0.13], [Math.PI / 2, 0, 0]);
  },

  // ---------------------------------------------------------------- a four-pronged grapple, a brass collar, coiled rope
  grappleHook(b) {
    const T = tx('grapple', 64, 16, (p) => {
      p.metal(0, 0, 64, 16, PAL.iron, { b: 2.5, polish: false });
      p.R(0, 3, 64, 2, PAL.iron, 4); p.rust(20, 9, 4, 2); p.drip(21, 11, 4);
      p.R(54, 0, 10, 16, PAL.steel, 4); p.R(54, 3, 10, 2, PAL.steel, 5);
    });
    const iron = mat('grapple', T, { rough: 0.55, metal: 0.4 });
    const g = b.sub([0.18, 0.12, 0], [0.12, 0.35, -0.38]);
    g.add(cyl(0.07, 1.0, 6, { ch: 0.015, side: T.r(0, 0, 40, 16) }), iron, [0, 0.12, 0]);
    g.add(torus(0.12, 0.04, 5, 10, TAU, T.r(0, 0, 40, 16)), iron, [0, 0.72, 0]);
    for (let i = 0; i < 4; i++) {
      const pr = g.sub([0, -0.36, 0], [0, (i / 4) * TAU + 0.4, 0]);
      pr.add(tube([[0, 0.05, 0], [0.18, -0.08, 0], [0.42, -0.04, 0], [0.56, 0.18, 0], [0.56, 0.38, 0]], (t) => (t < 0.75 ? 0.055 : 0.055 * Math.max(0.15, 1 - (t - 0.75) * 4)), { radial: 4, segs: 9 }), iron);
      pr.add(hull([[0.535, 0.24, 0.02], [0.535, 0.24, -0.02], [0.535, 0.32, 0.02], [0.535, 0.32, -0.02], [0.44, 0.2, 0]]), S.point());
    }
    const brassT = tx('collar', 32, 8, (p) => { p.all(PAL.brass, 3.5); p.R(0, 0, 32, 2, PAL.brass, 5); p.R(0, 6, 32, 2, PAL.brass, 1.5); for (let x = 2; x < 32; x += 8) p.rivet(x, 2, PAL.brass); });
    g.add(cyl(0.11, 0.16, 8, { ch: 0.02, side: brassT.r(0, 0, 32, 8) }), mat('collar', brassT, { rough: 0.3, metal: 0.6 }), [0, -0.3, 0]);
    // the rope: tied on at the ring, coiled below left
    const rope = S.rope();
    b.add(tube([[0.42, 0.7, 0.02], [0.2, 0.86, 0.1], [-0.25, 0.75, 0.15], [-0.55, 0.3, 0.2], [-0.62, -0.15, 0.3]], 0.045, { radial: 4, segs: 10 }), rope);
    coil(b, rope, { R: 0.3, r: 0.05, turns: 2.6, pitch: 0.075, pos: [-0.5, -0.72, 0.05], rot: [0.5, 0, 0.1] });
    g.add(brilliant(0.07, 6), S.amethyst(), [0, -0.3, 0.12], [0, 0, 0]);
  },

  // ---------------------------------------------------------------- a torn piece of trawl net with a cork float and a lead
  netShard(b) {
    const N = tx('netRope', 16, 8, (p) => p.rope(0, 0, 16, 8, pal('#4a8a5a'), { pitch: 4 }));
    const rope = mat('netRope', N, { rough: 0.9 });
    const knot = mat('netKnot', tx('netKnot', 8, 8, (p) => { p.all(pal('#4a8a5a'), 2.5); p.R(1, 1, 3, 2, pal('#4a8a5a'), 4.5); }), { rough: 0.9 });
    const s = 0.2;
    const inside = (x: number, y: number) => (y > -0.04 && y < 0.95 && x > -0.95 && x < 0.95) || (x > -0.95 && x < 0.04 && y > -0.95 && y < 0.95);
    const pts = new Map<string, V3>();
    for (let u = -6; u <= 6; u++) for (let v = -6; v <= 6; v++) {
      const x = (u - v) * s + 0.05, y = (u + v) * s;
      const sag = Math.sin(x * 2.4) * 0.05 + Math.cos(y * 2.1) * 0.05;
      if (inside(x, y)) pts.set(u + ',' + v, [x + Math.sin(y * 5) * 0.025, y + Math.cos(x * 5) * 0.02, sag]);
    }
    for (const [k, p0] of pts) {
      const [u, v] = k.split(',').map(Number);
      for (const k2 of [(u + 1) + ',' + v, u + ',' + (v + 1)]) { const p1 = pts.get(k2); if (p1) b.add(tube([p0, [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2 - 0.03], p1], 0.022, { radial: 3, segs: 3, caps: false }), rope); }
      b.add(new THREE.OctahedronGeometry(0.04, 0), knot, p0);
      // torn ends: a short frayed tail wherever a neighbour is missing on the outer edge
      if (!pts.get((u + 1) + ',' + v) && (u + v) % 3 === 0) b.add(tube([p0, [p0[0] + s * 0.4, p0[1] + s * 0.25, p0[2] + 0.02], [p0[0] + s * 0.55, p0[1] + s * 0.1, p0[2] + 0.04]], 0.02, { radial: 3, segs: 3 }), rope);
    }
    const F = tx('netFloat', 32, 16, (p) => { p.all(PAL.orange, 3.5); p.R(0, 0, 32, 3, PAL.orange, 5); p.R(0, 13, 32, 3, PAL.orange, 2); for (let x = 3; x < 32; x += 6) { p.t(x, 7, PAL.orange, 1.5); p.t(x + 1, 8, PAL.orange, 4.5); } });
    b.add(cyl(0.16, 0.26, 10, { ch: 0.04 }), mat('netFloat', F, { rough: 0.8 }), [0.7, 0.62, 0.08], [0.3, 0, 1.4]);
    b.add(lathe([[0, -0.1], [0.08, -0.09], [0.1, 0], [0.08, 0.09], [0, 0.1]], 8), S.lead(), [-0.66, -0.72, 0.06], [0, 0, 0.4], [1, 1.6, 1]);
  },

  // ---------------------------------------------------------------- a dented green tackle box: brass corners, latches, a sticker, a lure hanging out
  tackleBox(b) {
    const G = pal('#3e7a3a'), G2 = pal('#5a9a46');
    const F = tx('tackleFront', 96, 48, (p) => {
      p.panel(0, 0, 96, 48, G, 3, { e: 2 });
      for (const y of [12, 36]) { p.R(4, y, 88, 1, G, 1.5); p.R(4, y + 1, 88, 1, G, 4); }
      // sticker: a fish on a cream oval, and the maker's name
      p.ellipse(28, 24, 14, 8, (nx, ny) => rgb(PAL.paper, Math.hypot(nx, ny) > 0.85 ? 2 : 4.5));
      p.poly([[18, 24], [30, 19], [36, 24], [30, 29]], rgb(PAL.blue, 3)); p.poly([[36, 24], [41, 20], [41, 28]], rgb(PAL.blue, 3)); p.t(22, 23, PAL.ink, 0);
      p.R(54, 19, 32, 10, PAL.ink, 2); p.text('TACKLE', 58, 22, rgb(PAL.yellow, 4.5));
      // wear: paint chips to bare metal, a dent, rust along the bottom
      for (const [x, y, w] of [[8, 40, 5], [70, 8, 4], [88, 30, 3], [48, 42, 6]] as V3[]) { p.R(x, y, w, 2, PAL.steel, 3.5); p.R(x, y + 2, w, 1, G, 1.5); }
      p.ellipse(74, 38, 6, 4, (nx, ny) => rgb(G, nx + ny < 0 ? 2 : 4));
      p.rust(14, 45, 3, 2); p.rust(82, 45, 3, 5); p.drip(15, 44, 3);
    });
    const Ld = tx('tackleLid', 96, 32, (p) => {
      p.panel(0, 0, 96, 32, G2, 3, { e: 2 });
      for (let x = 8; x < 96; x += 20) { p.R(x, 4, 12, 24, G2, 2.5); p.R(x, 4, 12, 1, G2, 1.5); p.R(x, 27, 12, 1, G2, 4.5); }
      p.scratch(30, 10, 14, G2, 0.2); p.R(60, 14, 5, 2, PAL.steel, 4);
    });
    const body = mat('tackleFront', F, { rough: 0.55, metal: 0.25 }), lid = mat('tackleLid', Ld, { rough: 0.5, metal: 0.25 });
    b.add(cbox(2.6, 1.0, 1.05, 0.07, { pz: F.r(0, 0, 96, 48), nz: F.r(0, 0, 96, 48), side: F.r(0, 0, 40, 48), py: Ld.r(0, 0, 96, 32), ny: F.r(0, 0, 96, 48) }), body, [0, -0.28, 0]);
    b.add(cbox(2.66, 0.38, 1.1, 0.07, { pz: Ld.r(0, 20, 96, 12), nz: Ld.r(0, 20, 96, 12), side: Ld.r(0, 20, 32, 12), py: Ld.r(0, 0, 96, 32) }), lid, [0, 0.42, -0.02], [-0.06, 0, 0]);
    const brassT = tx('tbBrass', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.brass, { b: 3.5 }); p.panel(0, 0, 16, 16, PAL.brass, 3.5, { noFill: true }); p.rivet(6, 6, PAL.brass); });
    const brass = mat('tbBrass', brassT, { rough: 0.3, metal: 0.6 });
    for (const x of [-1, 1]) for (const y of [-1, 1]) b.add(cbox(0.24, 0.24, 1.14, 0.04), brass, [x * 1.24, y > 0 ? 0.48 : -0.7, 0]);
    const chrome = S.chrome();
    for (const x of [-0.7, 0.7]) { b.add(cbox(0.24, 0.3, 0.08, 0.02), chrome, [x, 0.22, 0.56]); b.add(cbox(0.14, 0.1, 0.1, 0.02), chrome, [x, 0.36, 0.58]); }
    // the folding handle
    b.add(tube([[-0.55, 0.62, 0], [-0.5, 0.9, 0], [0, 0.98, 0], [0.5, 0.9, 0], [0.55, 0.62, 0]], 0.06, { radial: 6, segs: 14 }), mat('rubberGrip', tx('rubberGrip', 32, 8, (p) => { p.all(PAL.black, 3); for (let x = 0; x < 32; x += 3) p.R(x, 0, 1, 8, PAL.black, 1); p.R(0, 1, 32, 1, PAL.black, 5); }), { rough: 0.7 }));
    for (const x of [-0.55, 0.55]) b.add(cbox(0.14, 0.12, 0.2, 0.02), chrome, [x, 0.62, 0]);
    // a red-and-white spoon caught in the lid, dangling
    const spoon = mat('tbSpoon', tx('tbSpoon', 16, 16, (p) => { p.all(PAL.red, 3.5); p.R(0, 8, 16, 8, PAL.white, 4); p.R(0, 0, 16, 2, PAL.red, 5); }), { rough: 0.3, metal: 0.3 });
    b.add(warp(lathe([[0, -0.14], [0.08, -0.08], [0.09, 0.04], [0.04, 0.13], [0, 0.15]], 8), (v) => { v.z *= 0.25; }), spoon, [0.95, -0.02, 0.6], [0, 0, 0.3]);
    b.add(tube([[0.88, 0.24, 0.57], [0.91, 0.18, 0.6], [0.93, 0.13, 0.6]], 0.012, { radial: 3, segs: 4 }), S.wire());
    treble(b, S.wire(), [0.99, -0.2, 0.6], 0.9);
  },

  // ---------------------------------------------------------------- a snapped carbon rod tip, bent under a fish that got away
  rodTip(b) {
    const C = tx('carbon', 16, 64, (p) => {
      for (let y = 0; y < 64; y++) for (let x = 0; x < 16; x++) p.t(x, y, PAL.navy, ((x >> 1) + (y >> 1)) % 2 ? 2.5 : 3);
      p.R(3, 0, 2, 64, PAL.navy, 5); p.R(12, 0, 2, 64, PAL.navy, 1);
      p.text('PRO', 4, 52, rgb(PAL.gold, 4));
    });
    const blank = mat('carbon', C, { rough: 0.3, metal: 0.2 });
    const path: V3[] = [[0, -1.38, 0], [0.04, -0.7, 0.02], [0.14, 0.0, 0.03], [0.32, 0.65, 0.02], [0.58, 1.2, 0], [0.7, 1.38, 0]];
    const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)));
    b.add(tube(path, (t) => 0.075 - t * 0.045, { radial: 6, segs: 18, uv: [0, 0, 1, 1] }), blank);
    const W = tx('wrap', 16, 16, (p) => { p.all(PAL.red, 3); for (let y = 0; y < 16; y += 2) p.R(0, y, 16, 1, PAL.red, 2); p.R(0, 0, 16, 3, PAL.gold, 4); p.R(0, 13, 16, 3, PAL.gold, 4); p.R(0, 0, 16, 1, PAL.gold, 5); });
    const wrap = mat('wrap', W, { rough: 0.4, metal: 0.2 });
    const ring = S.chrome();
    for (const t of [0.12, 0.38, 0.62, 0.84]) {
      const c = curve.getPointAt(t), tg = curve.getTangentAt(t), ang = Math.atan2(-tg.x, tg.y), r = 0.075 - t * 0.045;
      b.add(cyl(r + 0.022, 0.12, 6, { side: W.r(0, 0, 16, 16) }), wrap, [c.x, c.y, c.z], [0, 0, ang]);
      const nx = Math.cos(ang), ny = Math.sin(ang), d = 0.13 - t * 0.04;
      b.add(torus(0.055 - t * 0.02, 0.013, 3, 8), ring, [c.x + nx * d, c.y + ny * d, c.z], [Math.PI / 2, 0, 0]);
      b.add(cyl(0.012, d, 3), ring, [c.x + nx * d * 0.5, c.y + ny * d * 0.5, c.z], [0, 0, ang - Math.PI / 2]);
    }
    const top = curve.getPointAt(1);
    b.add(torus(0.045, 0.015, 3, 8), ring, [top.x + 0.02, top.y + 0.03, top.z], [0, 0, -0.5]);
    // splinters where it snapped
    const spl = mat('carbonSplinter', tx('carbonSpl', 8, 8, (p) => { p.all(PAL.navy, 2); p.R(0, 0, 8, 2, PAL.navy, 4); }), { rough: 0.6 });
    for (const [x, z, a] of [[-0.04, 0.03, 0.3], [0.05, -0.02, -0.25], [0.0, 0.05, 0.05]] as V3[]) b.add(cone(0.025, 0.18, 3), spl, [x, -1.45, z], [Math.PI, 0, a]);
    // the line still threaded through, snapping loose below
    b.add(tube([[0.72, 1.4, 0.01], [0.6, 1.0, 0.1], [0.36, 0.4, 0.12], [0.2, -0.3, 0.1], [0.24, -0.9, 0.12], [0.34, -1.3, 0.08]], 0.01, { radial: 3, segs: 18 }), S.line());
    b.add(brilliant(0.045, 6), S.sapphire(), [0.07, -1.0, 0.08]);
  },

  // ---------------------------------------------------------------- needle-nose pliers: long jaws, red dipped grips, a spring
  pliers(b) {
    const bl = bladePage('pliers', PAL.steel, { etch: (p) => { for (let x = 40; x < 64; x += 2) p.R(x, 12, 1, 3, PAL.steel, 1); } });
    const steel = mat('blade:pliers', bl, { rough: 0.35, metal: 0.6 });
    const grip = mat('pliersGrip', tx('pliersGrip', 48, 16, (p) => { p.all(PAL.red, 3); p.R(0, 0, 48, 3, PAL.red, 4.5); p.R(0, 12, 48, 4, PAL.red, 2); for (let x = 6; x < 44; x += 5) { p.R(x, 4, 2, 8, PAL.red, 2.5); p.R(x, 4, 2, 1, PAL.red, 4); } p.R(0, 0, 3, 16, PAL.red, 1.5); }), { rough: 0.6 });
    for (const s of [1, -1] as const) {
      const h = b.sub([0, 0, s * 0.03], [0, 0, s * 0.07]);
      const jaw: V2[] = [[-0.2, 0.08 * s], [0.25, 0.05 * s], [0.9, 0.022 * s], [1.0, 0.0], [0.9, -0.004 * s], [0.25, -0.012 * s], [-0.05, -0.03 * s], [-0.2, -0.1 * s], [-0.28, -0.04 * s]];
      if (s < 0) jaw.reverse();
      h.add(ext(jaw, 0.07, 0.018, { rects: { pz: bl.r(0, 0, 64, 16), nz: bl.r(0, 0, 64, 16), side: bl.r(0, 13, 64, 3) } }), steel);
      h.add(tube([[-0.24, -0.06 * s, 0], [-0.55, -0.16 * s, 0], [-0.95, -0.2 * s, 0]], (t) => 0.058 + Math.sin(t * Math.PI) * 0.02, { radial: 6, segs: 8, uv: [0, 0, 1, 1] }), grip);
    }
    b.add(cyl(0.07, 0.18, 8, { ch: 0.02 }), S.brassPin(), [-0.05, 0, 0], [Math.PI / 2, 0, 0]);
    b.add(tube([[-0.32, 0.05, 0], [-0.42, 0.0, 0.02], [-0.32, -0.05, 0]], 0.014, { radial: 3, segs: 6 }), S.wire());
  },

  // ---------------------------------------------------------------- a spinner: a hammered willow blade on a clevis, beads, a tuft
  spinnerSpoon(b0) {
    const b = b0.sub([0.04, 0.06, 0], [0, 0, -0.62], 1.0);
    const SB = tx('spinBlade', 32, 48, (p) => {
      p.metal(0, 0, 32, 48, PAL.silver, { b: 3.5 });
      for (let y = 4; y < 46; y += 6) for (let x = (y % 12 === 4 ? 3 : 6); x < 30; x += 6) { p.t(x, y, PAL.silver, 5); p.t(x + 1, y + 1, PAL.silver, 2); }
      for (const [x, y] of [[10, 30], [20, 34], [15, 40]] as V2[]) { p.ellipse(x, y, 2.5, 2.5, rgb(PAL.red, 3.5)); p.t(x - 1, y - 1, PAL.red, 5); }
      p.R(4, 8, 4, 18, PAL.silver, 5); p.glint(6, 10, 2);
    });
    const blade = mat('spinBlade', SB, { rough: 0.2, metal: 0.7, side: THREE.DoubleSide });
    b.add(surf(6, 6, (u, v) => { const y = v * 0.95 - 0.47, w = 0.36 * Math.sin(Math.min(1, v * 1.05) * Math.PI * 0.9 + 0.1) * (0.55 + v * 0.45); const x = (u * 2 - 1) * w; return [x, y, -0.12 * (1 - (u * 2 - 1) * (u * 2 - 1)) * Math.sin(v * Math.PI)]; }, { uv: SB.r(0, 0, 32, 48) }), blade, [0.12, 0.06, 0.08], [0.2, -0.5, -0.35]);
    const wire = S.wire();
    b.add(cyl(0.012, 0.95, 4), wire, [-0.04, 0.0, 0], [0, 0, -0.35]);
    b.add(torus(0.05, 0.012, 3, 8), wire, [0.12, 0.43, 0], [0, 0, -0.35]);
    const bead = mat('spinBead', tx('spinBead', 8, 8, (p) => { p.all(PAL.gold, 3.5); p.R(1, 1, 3, 2, PAL.gold, 5); }), { rough: 0.25, metal: 0.6 });
    for (let i = 0; i < 3; i++) b.add(ball(0.045, 6, 4), bead, [-0.02 - i * 0.03, 0.08 - i * 0.08, 0.02], [0, 0, 0], 1, { smooth: 1 });
    b.add(lathe([[0, -0.12], [0.06, -0.08], [0.07, 0.06], [0.03, 0.12], [0, 0.13]], 8), S.brass(), [-0.14, -0.2, 0.02], [0, 0, -0.35]);
    treble(b, wire, [-0.24, -0.34, 0.02], 1.1);
    const tuft = mat('spinTuft', tx('spinTuft', 8, 16, (p) => { p.all(PAL.red, 3.5); p.R(0, 0, 8, 4, PAL.yellow, 4.5); p.R(3, 0, 1, 16, PAL.red, 5); }), { rough: 0.8 });
    for (const a of [-0.35, 0, 0.35]) b.add(cone(0.035, 0.2, 4), tuft, [-0.26 + Math.sin(a) * 0.06, -0.48, 0.02], [Math.PI, 0, a]);
  },

  // ---------------------------------------------------------------- a long fillet knife: etched blade, rosewood, brass rivets
  filletKnife(b) {
    const bl = bladePage('fillet', PAL.steel, { w: 96, h: 16, etch: (p) => { p.text('FILLET', 20, 5, rgb(PAL.steel, 1.5)); for (let i = 0; i < 12; i++) { p.t(52 + i, 6 + Math.round(Math.sin(i / 2) * 2), PAL.steel, 1.5); } p.R(64, 6, 3, 3, PAL.steel, 1.5); } });
    const steel = mat('blade:fillet', bl, { rough: 0.25, metal: 0.65 });
    const out: V2[] = [[-0.4, 0.07], [0.2, 0.08], [0.9, 0.06], [1.3, 0.06], [1.5, 0.12], [1.36, 0.0], [1.0, -0.06], [0.3, -0.09], [-0.4, -0.09]];
    b.add(ext(out, 0.035, 0.012, { rects: { pz: bl.r(0, 0, 96, 16), nz: bl.r(0, 0, 96, 16), side: bl.r(0, 13, 96, 3) } }), steel, [0, 0, 0]);
    const H = tx('rosewood', 48, 16, (p) => { p.wood(0, 0, 48, 16, pal('#6a2a1a'), { seed: 3, knots: 0, lines: 4 }); p.R(0, 0, 48, 1, pal('#6a2a1a'), 4.5); p.R(0, 15, 48, 1, pal('#6a2a1a'), 1); p.R(20, 6, 8, 4, PAL.gold, 4); p.R(20, 6, 8, 1, PAL.gold, 5); });
    b.add(cbox(0.95, 0.24, 0.18, 0.05, { pz: H.r(0, 0, 48, 16), nz: H.r(0, 0, 48, 16), side: H.r(0, 0, 48, 4) }), mat('rosewood', H, { rough: 0.55 }), [-0.9, -0.01, 0], [0, 0, 0.02]);
    const brass = S.brass();
    b.add(cbox(0.08, 0.32, 0.22, 0.02), brass, [-0.4, 0.0, 0]);
    for (const x of [-1.2, -0.95, -0.7]) b.add(cyl(0.035, 0.22, 6), S.brassPin(), [x, -0.01, 0], [Math.PI / 2, 0, 0]);
    b.add(cbox(0.06, 0.26, 0.2, 0.02), brass, [-1.38, -0.01, 0]);
    b.add(brilliant(0.07, 6), S.amethyst(), [-1.42, -0.01, 0.0], [0, -Math.PI / 2, 0]);
    b.add(brilliant(0.05, 6), S.amethyst(), [-0.9, -0.01, 0.1]);
  },

  // ---------------------------------------------------------------- a barbed harpoon head lashed to a stub of oar
  harpoonTip(b) {
    const T = tx('harpHead', 32, 48, (p) => {
      p.metal(0, 0, 32, 48, PAL.iron, { b: 2.5 });
      p.R(0, 0, 32, 48, PAL.iron, 2.5);
      for (let y = 0; y < 48; y++) { p.t(0, y, PAL.steel, 5); p.t(31, y, PAL.steel, 4); }
      p.ln(16, 2, 16, 40, PAL.iron, 4); p.ln(17, 4, 17, 40, PAL.iron, 1.5);
      p.rust(10, 34, 3, 2); p.rust(22, 26, 2.5, 3);
    });
    const iron = mat('harpHead', T, { rough: 0.45, metal: 0.5 });
    const head: V2[] = [[0, 0.95], [0.12, 0.6], [0.09, 0.5], [0.24, 0.22], [0.08, 0.36], [0.06, 0.15], [-0.06, 0.15], [-0.08, 0.36], [-0.24, 0.22], [-0.09, 0.5], [-0.12, 0.6]];
    b.add(warp(ext(head, 0.1, 0.03, { rects: { pz: T.r(0, 0, 32, 48), nz: T.r(0, 0, 32, 48), side: T.r(0, 0, 2, 48) } }), (v) => { v.z *= 1 - Math.abs(v.x) * 2.5; }), iron);
    b.add(cyl(0.075, 0.42, 6, { rTop: 0.065, ch: 0.015 }), S.iron(), [0, -0.04, 0]);
    const Wd = tx('oarStub', 16, 48, (p) => { p.wood(0, 0, 16, 48, PAL.oak, { vertical: true, seed: 2, knots: 1 }); p.R(0, 44, 16, 4, PAL.oak, 4.5); for (let x = 0; x < 16; x += 3) p.t(x, 46 + (x % 2), PAL.oak, 1); });
    b.add(cyl(0.1, 0.72, 7, { side: Wd.r(0, 0, 16, 48), cap: Wd.r(0, 44, 16, 4) }), mat('oarStub', Wd, { rough: 0.85 }), [0, -0.58, 0]);
    for (const [x, z, a] of [[-0.05, 0.03, 0.3], [0.06, -0.02, -0.3]] as V3[]) b.add(cone(0.035, 0.16, 3), mat('oarStub', Wd), [x, -0.98, z], [Math.PI, 0, a]);
    const rope = S.rope();
    coil(b, rope, { R: 0.105, r: 0.03, turns: 3, pitch: 0.06, pos: [0, -0.32, 0] });
    b.add(tube([[0.1, -0.32, 0.03], [0.2, -0.42, 0.06], [0.22, -0.56, 0.05]], 0.026, { radial: 4, segs: 5 }), rope);
    b.add(brilliant(0.06, 6), S.amethyst(), [0, 0.12, 0.07]);
  },

  // ---------------------------------------------------------------- an opened can of worms: peeled lid, a label, worms spilling
  wormCan(b) {
    const T = tx('wormCan', 64, 40, (p) => {
      p.metal(0, 0, 64, 40, PAL.silver, { b: 3 });
      p.R(0, 6, 64, 26, PAL.yellow, 3.5); p.R(0, 6, 64, 1, PAL.yellow, 5); p.R(0, 31, 64, 1, PAL.yellow, 2);
      p.text('WORMS', 6, 10, rgb(PAL.red, 2.5));
      for (let i = 0; i < 18; i++) { const x = 8 + i, y = 23 + Math.round(Math.sin(i * 0.6) * 2); p.R(x, y, 1, 3, PAL.pink, i % 4 === 0 ? 2.5 : 3.5); p.t(x, y, PAL.pink, 4.5); }
      p.R(26, 21, 2, 2, PAL.ink, 0);
      p.R(36, 12, 22, 14, PAL.white, 4); p.text('LIVE', 39, 14, rgb(PAL.ink, 2)); p.text('BAIT', 39, 20, rgb(PAL.ink, 2));
      for (let y = 0; y < 6; y += 2) p.R(0, y, 64, 1, PAL.silver, 2); for (let y = 33; y < 40; y += 2) p.R(0, y, 64, 1, PAL.silver, 2);
      p.rust(60, 36, 3, 2); p.rust(4, 3, 2, 5);
    });
    const can = mat('wormCan', T, { rough: 0.45, metal: 0.4 });
    b.add(lathe([[0, -0.36], [0.27, -0.36], [0.3, -0.33], [0.29, -0.28], [0.29, 0.28], [0.3, 0.32], [0.27, 0.34], [0.25, 0.3], [0, 0.3]], 12, { side: T.r(0, 0, 64, 40), cap: T.r(0, 0, 64, 6) }), can, [0, -0.08, 0]);
    // dirt and worms
    b.add(cyl(0.25, 0.02, 10), mat('dirt', tx('dirt', 16, 16, (p) => { p.stone(0, 0, 16, 16, pal('#4a3020'), { cell: 4, seed: 2, cracks: 0 }); }), { rough: 1 }), [0, 0.2, 0]);
    const worm = mat('worm', tx('worm', 32, 8, (p) => { p.all(PAL.pink, 3.5); for (let x = 0; x < 32; x += 3) p.R(x, 0, 1, 8, PAL.pink, 2.5); p.R(0, 1, 32, 1, PAL.pink, 5); p.R(14, 0, 4, 8, PAL.pink, 2.5); }), { rough: 0.35 });
    for (const pts of [[[0.08, 0.2, 0.05], [0.18, 0.38, 0.12], [0.3, 0.32, 0.25], [0.34, 0.1, 0.32], [0.3, -0.05, 0.36]], [[-0.1, 0.2, 0.0], [-0.16, 0.42, 0.06], [-0.04, 0.52, 0.1], [0.04, 0.44, 0.12]], [[-0.15, 0.2, 0.1], [-0.3, 0.28, 0.2], [-0.38, 0.12, 0.28], [-0.36, -0.1, 0.3]]] as V3[][]) b.add(tube(pts, (t) => 0.045 * (t > 0.85 ? 0.7 : 1), { radial: 5, segs: pts.length * 3 }), worm, [0, 0, 0], [0, 0, 0], 1, { smooth: 1 });
    // the peeled lid, jagged, bent back on its hinge
    const lidT = tx('canLid', 32, 32, (p) => { p.metal(0, 0, 32, 32, PAL.silver, { b: 3.5 }); for (const r of [6, 10, 13]) p.ellipse(16, 16, r, r, (nx, ny) => (Math.hypot(nx, ny) > 0.88 ? rgb(PAL.silver, 2) : null)); p.glint(9, 8, 1); });
    const lidOut: V2[] = []; for (let i = 0; i <= 14; i++) { const a = (i / 14) * TAU, r = 0.27 * (i % 2 ? 0.94 : 1); lidOut.push([Math.cos(a) * r, Math.sin(a) * r]); }
    b.add(ext(lidOut.slice(0, 14), 0.02, 0.006, { rects: lidT.r(0, 0, 32, 32) }), mat('canLid', lidT, { rough: 0.3, metal: 0.6 }), [0, 0.42, -0.36], [-0.35, 0, 0]);
  },

  // ---------------------------------------------------------------- a spool of monofilament: wooden flanges, a label, a loose end
  lineSpool(b) {
    const F = tx('spoolFlange', 32, 32, (p) => {
      p.wood(0, 0, 32, 32, PAL.oak, { seed: 9, knots: 0 });
      p.ellipse(16, 16, 15, 15, (nx, ny) => (Math.hypot(nx, ny) > 0.9 ? rgb(PAL.oak, nx + ny < 0 ? 4.5 : 1.5) : null));
      p.ellipse(16, 16, 9, 9, rgb(PAL.paper, 4.5)); p.ellipse(16, 16, 9, 9, (nx, ny) => (Math.hypot(nx, ny) > 0.85 ? rgb(PAL.red, 3) : null));
      p.text('40M', 11, 14, rgb(PAL.red, 2.5)); p.ellipse(16, 16, 2, 2, rgb(PAL.ink, 0));
    });
    const L = tx('spoolLine', 48, 16, (p) => { for (let y = 0; y < 16; y++) p.R(0, y, 48, 1, PAL.teal, y % 2 ? 3.5 : 4.5); for (let x = 0; x < 48; x += 8) p.ln(x, 0, x + 4, 15, PAL.teal, 2.5); });
    const g = b.sub([0, 0, 0], [0.1, -0.45, 0.0]);
    const fl = mat('spoolFlange', F, { rough: 0.7 });
    for (const x of [-0.3, 0.3]) g.add(cyl(0.42, 0.08, 14, { ch: 0.02, side: F.r(0, 0, 32, 3), cap: F.r(0, 0, 32, 32) }), fl, [x, 0, 0], [0, 0, Math.PI / 2]);
    g.add(cyl(0.32, 0.52, 14, { side: L.r(0, 0, 48, 16), open: true }), mat('spoolLine', L, { rough: 0.35, emissive: '#0a4440', ek: 0.25 }), [0, 0, 0], [0, 0, Math.PI / 2]);
    b.add(tube([[0.1, 0.33, 0.2], [0.3, 0.4, 0.32], [0.46, 0.2, 0.3], [0.38, -0.08, 0.35], [0.46, -0.36, 0.3]], 0.014, { radial: 3, segs: 12 }), S.line());
  },
};
