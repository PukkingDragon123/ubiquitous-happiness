// Pixel-art flora and seabed details, painted pixel by pixel in code (src/world/pixart.ts) and shown on
// alpha-cut cards that sway in the vertex shader. Every species has real anatomy and every variant is grown
// from its own seed (different stipes, blade counts, lean, bladders), so the scenery never stamps clones.
//
//   giant kelp      holdfast, several wavy stipes, wrinkled serrated blades each on a gas bladder
//   bull kelp       holdfast, a long whip stipe thickening to a round bulb, a ribbon fringe streaming downcurrent
//   eelgrass        meadow clumps of long straps with a light vein, epiphyte-browned tips
//   sea lettuce     ruffled, translucent bright-green sheets
//   sargassum       branching stems, small serrated leaves and clusters of berry floats
//   feather algae   crimson pinnate fronds
//   sea fan         a gorgonian fan network with polyp dots
//   tube sponge     clustered tubes with dark oscula, rim highlights and pore rows
//   ...plus plumose anemones, sea whips, sea pens, hydroids, wrack, cold soft corals, glass sponges, tube
//   worms, glow corals, crinoids and bacterial mats; and small details: shells, starfish, urchins, anemones,
//   fish bones, tin cans, sand dollars.
import { Atlas } from './atlas';
import { Pix, hueRamp, curve, along, P2 } from './pixart';
import { Soup, UVR } from './lp';
import { Rng } from '../core/rng';
import type { AreaDef } from '../area/defs';

const TAU = Math.PI * 2;

export interface SpriteSpecies {
  id: string;
  /** sprite size in px and pixels per metre */
  w: number; h: number; ppm: number;
  /** variants painted per area */
  n: number;
  /** sway at the top in metres (per metre of height for tall plants) */
  flex: number;
  /** stretches to the water column (kelps) */
  tall?: boolean;
  glow?: number;
  paint(S: Pix, r: Rng, a: AreaDef, k: number): void;
}

// ------------------------------------------------------------------ painters
function holdfast(S: Pix, cx: number, by: number, w: number, m: number, r: Rng) {
  // a tangle of haptera gripping the rock
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.1 + 0.8 * (i / 6)) + r.range(-0.1, 0.1), L = w * r.range(0.4, 0.6);
    S.stem([[cx, by - 3], [cx + Math.cos(a) * L * 0.6, by - 2 - Math.sin(a) * 1.5], [cx + Math.cos(a) * L, by]], () => 1.6, m, -1);
  }
  S.ball(cx, by - 3, w * 0.22, m, { spec: false, ry: 2.5, bias: -1 });
}

function giantKelp(S: Pix, r: Rng, a: AreaDef) {
  const blade = S.mat(hueRamp(a.id === 'arctic' ? '#7a6a3a' : '#9a7424', 5));
  const stipe = S.mat(hueRamp('#5e4a1c', 4));
  const bladder = S.mat(hueRamp('#b89834', 4));
  const W = S.w, H = S.h, cx = W / 2 + r.range(-3, 3);
  const nst = r.int(2, 3);
  for (let s = 0; s < nst; s++) {
    const lean = r.range(-W * 0.12, W * 0.12), sway = r.range(2, 5), ph = r.range(0, TAU);
    const top = r.range(2, 10) + s * r.range(4, 14);
    const ctrl: P2[] = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; ctrl.push([cx + (s - (nst - 1) / 2) * 3 + lean * t * t + Math.sin(t * 5 + ph) * sway, H - 4 - (H - 4 - top) * t]); }
    const path = curve(ctrl, 40);
    // blades first (behind), then the stipe over their bases, then bladders
    const blades: { p: P2; dir: number; L: number }[] = [];
    let side = r.chance(0.5) ? 1 : -1;
    for (let y = 14 + r.int(0, 6); y < path.length * 6; y += r.int(9, 13)) {
      const t = y / (path.length * 6);
      if (t > 1) break;
      const { p, d } = along(path, 1 - t);
      if (r.chance(0.7)) side = -side;           // mostly alternate, sometimes two in a row
      if (r.chance(0.12)) continue;              // a gap where a blade tore off
      blades.push({ p, dir: side, L: r.range(18, 44) * (t > 0.85 ? 1.3 : 1) });
      void d;
    }
    for (const b of blades) {
      // long wrinkled blades hang off the stipe, each on its own float, drooping as they grow
      const ang = -Math.PI / 2 + b.dir * r.range(0.45, 1.35), L = b.L;
      const droop = r.range(0.15, 1.0) * b.dir;
      const c: P2[] = [[b.p[0] + b.dir * 2.5, b.p[1]]];
      for (let i = 1; i <= 4; i++) { const t = i / 4, aa = ang + droop * t; c.push([c[i - 1][0] + Math.cos(aa) * L / 4, c[i - 1][1] + Math.sin(aa) * L / 4 + t * t * 3]); }
      const wmax = r.range(6, 8.5);
      S.blade(curve(c, 16), (t) => (t < 0.06 ? 1.5 : wmax * Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI * 0.95 + 0.08), 0.8)), blade, { wrinkle: 3, serrate: 3, rib: null, phase: r.int(0, 3), bias: r.chance(0.3) ? -1 : 0 });
    }
    S.stem(path, (t) => 2.2 - t * 0.8, stipe);
    for (const b of blades) S.ball(b.p[0] + b.dir * 2.5, b.p[1], 2.2, bladder, { ry: 2.6 });
  }
  holdfast(S, cx, H - 1, 14, stipe, r);
}

function bullKelp(S: Pix, r: Rng) {
  const stipe = S.mat(hueRamp('#6e5424', 4)), bulb = S.mat(hueRamp('#7e622a', 5)), fringe = S.mat(hueRamp('#8e722c', 5));
  const W = S.w, H = S.h, cx = W * 0.22 + r.range(-3, 3);
  const bx = cx + r.range(4, 12), by = r.range(22, 34);
  const path = curve([[cx, H - 3], [cx + r.range(-4, 4), H * 0.7], [bx + r.range(-6, 3), H * 0.35], [bx, by + 6]], 40);
  // the ribbon fringe streams downcurrent (to the right)
  const nb = r.int(9, 13);
  for (let i = 0; i < nb; i++) {
    const L = r.range(W * 0.45, W - bx - 4), droop = r.range(-14, 30), wav = r.range(2, 4.5), ph = r.range(0, TAU);
    const c: P2[] = [];
    for (let k = 0; k <= 6; k++) { const t = k / 6; c.push([bx + 3 + t * L, by + (i - nb / 2) * 1.2 + droop * t * t + Math.sin(t * 7 + ph) * wav]); }
    S.blade(curve(c, 24), (t) => (t < 0.05 ? 1.5 : 4.4 + Math.sin(t * 9 + ph) * 0.8 - t * 1.6), fringe, { wrinkle: 5, rib: null, bias: i % 3 === 0 ? -1 : 0, phase: i });
  }
  S.stem(path, (t) => 1.6 + t * 1.6, stipe);
  S.ball(bx, by + 3, 5, bulb, { ry: 4.6 });
  holdfast(S, cx, H - 1, 12, stipe, r);
}

function eelgrass(S: Pix, r: Rng) {
  const g = S.mat(hueRamp('#3e8a34', 5)), tip = S.mat(hueRamp('#a09450', 4));
  const W = S.w, H = S.h;
  const n = r.int(7, 11);
  for (let i = 0; i < n; i++) {
    const x0 = W / 2 + r.range(-W * 0.22, W * 0.22), L = r.range(H * 0.55, H - 3), lean = r.range(-W * 0.32, W * 0.32), wv = r.range(0, 3);
    const c: P2[] = [[x0, H - 1], [x0 + lean * 0.15 + wv, H - L * 0.4], [x0 + lean * 0.55 - wv, H - L * 0.75], [x0 + lean, H - L]];
    const path = curve(c, 18);
    const brown = r.chance(0.4);
    S.blade(path, (t) => (t > 0.94 ? 1.4 : 3.2 - t * 0.6), g, { rib: 'light', rim: false, bias: i % 3 === 0 ? -1 : 0 });
    if (brown) { const k = Math.floor(path.length * r.range(0.72, 0.85)); S.blade(path.slice(k), () => 2.6, tip, { rim: false }); }
  }
}

function seaLettuce(S: Pix, r: Rng) {
  const g = S.mat(hueRamp('#5abb3e', 5, { spread: 1.2 }));
  const W = S.w, H = S.h;
  const n = r.int(3, 5);
  for (let i = 0; i < n; i++) {
    const x0 = W / 2 + r.range(-3, 3), ang = -Math.PI / 2 + r.range(-0.9, 0.9), L = r.range(H * 0.5, H * 0.85);
    const c: P2[] = [[x0, H - 1]];
    for (let k = 1; k <= 4; k++) { const t = k / 4; c.push([x0 + Math.cos(ang) * L * t + Math.sin(k * 2.1 + i) * 2, H - 1 + Math.sin(ang) * L * t]); }
    const wmax = r.range(12, 18), ph = r.range(0, TAU);
    // wavy, ruffled sheet: the width pulses along the blade, folds are corrugation lines, edges glow
    S.blade(curve(c, 20), (t) => (t < 0.08 ? 2 : wmax * Math.sin(Math.min(1, t * 1.1 + 0.1) * Math.PI) * (0.85 + 0.15 * Math.sin(t * 14 + ph))), g, { wrinkle: 5, rib: null, bias: i % 2 ? -1 : 0, phase: i * 2 });
  }
}

function sargassum(S: Pix, r: Rng) {
  const stem = S.mat(hueRamp('#6e5218', 4)), leaf = S.mat(hueRamp('#a8822a', 5)), berry = S.mat(hueRamp('#c49a44', 4));
  const W = S.w, H = S.h;
  const branch = (x: number, y: number, ang: number, L: number, depth: number) => {
    const c: P2[] = [[x, y]];
    for (let k = 1; k <= 3; k++) { const t = k / 3, aa = ang + Math.sin(k * 1.7 + depth) * 0.25; c.push([c[k - 1][0] + Math.cos(aa) * L / 3, c[k - 1][1] + Math.sin(aa) * L / 3]); }
    const path = curve(c, 12);
    const berries: P2[] = [];
    for (let s = 3; s < path.length - 1; s += r.int(3, 5)) {
      const { p, d } = along(path, s / (path.length - 1)), side = s % 2 ? 1 : -1;
      const la = Math.atan2(d[1], d[0]) + side * r.range(0.6, 1.0), ll = r.range(5, 8);
      S.blade([p, [p[0] + Math.cos(la) * ll * 0.5, p[1] + Math.sin(la) * ll * 0.5], [p[0] + Math.cos(la) * ll, p[1] + Math.sin(la) * ll]], (t) => 3 * Math.sin(Math.min(1, t * 1.1 + 0.08) * Math.PI), leaf, { serrate: 2, rib: 'dark', rim: false });
      if (r.chance(0.45)) berries.push([p[0] - Math.cos(la) * 2.5, p[1] - Math.sin(la) * 2.5]);
    }
    S.stem(path, () => 1.3, stem);
    for (const b of berries) { S.ball(b[0], b[1], 1.6, berry); if (r.chance(0.5)) S.ball(b[0] + 2, b[1] + 1.5, 1.3, berry); }
    if (depth < 2) for (let i = 0; i < r.int(1, 2); i++) { const t = r.range(0.35, 0.75), { p } = along(path, t); branch(p[0], p[1], ang + r.sign() * r.range(0.4, 0.8), L * r.range(0.45, 0.65), depth + 1); }
  };
  for (let i = 0; i < r.int(2, 3); i++) branch(W / 2 + r.range(-3, 3), H - 1, -Math.PI / 2 + r.range(-0.4, 0.4), H * r.range(0.65, 0.9), 0);
}

function featherAlgae(S: Pix, r: Rng, base = '#b0283a') {
  const m = S.mat(hueRamp(base, 5));
  const W = S.w, H = S.h;
  const frond = (x: number, y: number, ang: number, L: number, depth: number) => {
    const c: P2[] = [[x, y]];
    for (let k = 1; k <= 3; k++) { const aa = ang + Math.sin(k + depth * 2) * 0.2; c.push([c[k - 1][0] + Math.cos(aa) * L / 3, c[k - 1][1] + Math.sin(aa) * L / 3]); }
    const path = curve(c, 10);
    S.stem(path, (t) => (depth ? 1 : 1.6 - t * 0.5), m, depth ? 0 : -1);
    // pinnate branchlets, alternating, shortening toward the tip
    for (let s = 2; s < path.length - 1; s += 2) {
      const t = s / (path.length - 1), { p, d } = along(path, t), side = (s / 2) % 2 ? 1 : -1;
      const la = Math.atan2(d[1], d[0]) + side * 0.95, ll = (1 - t) * L * (depth ? 0.3 : 0.38) + 1.5;
      if (depth < 1 && ll > 6) frond(p[0], p[1], la, ll, depth + 1);
      else S.line(p[0], p[1], p[0] + Math.cos(la) * ll, p[1] + Math.sin(la) * ll, m, side > 0 ? 3 : 2);
    }
  };
  for (let i = 0; i < r.int(3, 4); i++) frond(W / 2 + r.range(-2, 2), H - 1, -Math.PI / 2 + r.range(-0.7, 0.7), H * r.range(0.6, 0.95), 0);
}

function seaFan(S: Pix, r: Rng, base: string) {
  const m = S.mat(hueRamp(base, 5)), polyp = S.mat(hueRamp('#f0e4d0', 3));
  const W = S.w, H = S.h;
  const tips: P2[] = [];
  const grow = (x: number, y: number, ang: number, L: number, d: number) => {
    const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
    const lit = ang < -Math.PI / 2 ? 3 : 2;
    S.line(x, y, ex, ey, m, d < 2 ? lit - 1 : lit);
    if (d < 2) S.line(x + 1, y, ex + 1, ey, m, lit - 1);
    if (d >= 5 || L < 3) { tips.push([ex, ey]); return; }
    const spread = 0.42 - d * 0.03;
    grow(ex, ey, ang - spread * r.range(0.6, 1.2), L * r.range(0.68, 0.85), d + 1);
    grow(ex, ey, ang + spread * r.range(0.6, 1.2), L * r.range(0.68, 0.85), d + 1);
  };
  grow(W / 2, H - 1, -Math.PI / 2 + r.range(-0.15, 0.15), H * 0.24, 0);
  // anastomoses: the fan's mesh cross-links between neighbouring tips
  tips.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i + 1 < tips.length; i++) if (Math.hypot(tips[i + 1][0] - tips[i][0], tips[i + 1][1] - tips[i][1]) < 7) S.line(tips[i][0], tips[i][1], tips[i + 1][0], tips[i + 1][1], m, 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S.get(x, y) === m && (x * 3 + y * 5) % 11 === 0) S.set(x, y, polyp, 1 + ((x + y) & 1));
}

function tubeSponge(S: Pix, r: Rng, base: string) {
  const m = S.mat(hueRamp(base, 5)), hole = S.mat(hueRamp('#2a1418', 3));
  const W = S.w, H = S.h;
  const n = r.int(3, 5);
  const tubes = Array.from({ length: n }, (_, i) => ({ x: W / 2 + (i - (n - 1) / 2) * r.range(4.5, 6) + r.range(-1, 1), L: r.range(H * 0.4, H * 0.95), w: r.range(5.5, 8), lean: r.range(-3, 3) })).sort((a, b) => b.L - a.L);
  for (const t of tubes) {
    const path: P2[] = curve([[t.x, H - 1], [t.x + t.lean * 0.4, H - t.L * 0.5], [t.x + t.lean, H - t.L]], 14);
    S.blade(path, (u) => t.w * (0.85 + u * 0.25), m, { rim: false });
    // pore rows down the lit flank
    for (let k = 4; k < path.length - 3; k += 3) { const { p } = along(path, k / (path.length - 1)); S.set(p[0] - t.w * 0.15, p[1], m, 1); }
    // the osculum: a dark mouth with a lit rim
    const tp = path[path.length - 1];
    const rx = t.w * 0.55;
    for (let x = -Math.ceil(rx); x <= Math.ceil(rx); x++) { const k = 1 - (x / rx) ** 2; if (k < 0) continue; S.set(tp[0] + x, tp[1], hole, x < 0 ? 0 : 1); S.set(tp[0] + x, tp[1] - 1, m, 4); }
  }
}

function plumose(S: Pix, r: Rng, base: string) {
  const col = S.mat(hueRamp(base, 5, { spread: 0.8 })), crown = S.mat(hueRamp(base, 5, { spread: 1.3 }));
  const W = S.w, H = S.h, cx = W / 2;
  const ch = r.range(H * 0.35, H * 0.55), cw = r.range(5, 7);
  S.blade([[cx, H - 1], [cx + r.range(-1, 1), H - ch]], (t) => cw * (1 + t * 0.2), col, { rim: false, wrinkle: 6 });
  // the cauliflower crown: lobes of fine tentacles, each lobe a lit ball of short strokes
  const lobes = r.int(5, 7);
  for (let i = 0; i < lobes; i++) {
    const a = Math.PI * (0.05 + 0.9 * i / (lobes - 1)), rr = r.range(3.5, 5.5);
    const lx = cx - Math.cos(a) * (W * 0.28), ly = H - ch - Math.sin(a) * (H * 0.16) - 2;
    S.ball(lx, ly, rr, crown, { spec: false });
    for (let k = 0; k < 6; k++) { const aa = a + r.range(-0.8, 0.8) + Math.PI; S.line(lx, ly, lx - Math.cos(aa) * (rr + 2), ly - Math.sin(aa) * (rr + 2) * 0.8, crown, 3); }
  }
}

function seaWhip(S: Pix, r: Rng, base: string) {
  const m = S.mat(hueRamp(base, 5)), pol = S.mat(hueRamp('#f8e8c8', 3));
  const W = S.w, H = S.h;
  for (let i = 0; i < r.int(2, 4); i++) {
    const x0 = W / 2 + r.range(-3, 3), bend = r.range(-W * 0.3, W * 0.3), L = r.range(H * 0.6, H - 2);
    const path = curve([[x0, H - 1], [x0 + bend * 0.2, H - L * 0.5], [x0 + bend, H - L]], 20);
    S.stem(path, (t) => 2.4 - t * 1.2, m);
    for (let k = 3; k < path.length; k += 3) { const { p } = along(path, k / (path.length - 1)); S.set(p[0] + ((k / 3) % 2 ? 1 : -1), p[1], pol, 2); }
  }
}

function seaPen(S: Pix, r: Rng, base: string, glow = false) {
  const m = S.mat(hueRamp(base, 5, { spread: glow ? 1.4 : 1 }));
  const W = S.w, H = S.h, cx = W / 2;
  const stalk = H * 0.3, lean = r.range(-2, 2);
  S.stem([[cx, H - 1], [cx + lean * 0.3, H - stalk]], () => 1.8, m, -1);
  // the feather: paired leaves (polyp rows) along the rachis
  const top = r.range(2, 5);
  for (let y = H - stalk; y > top; y -= 2) {
    const t = (H - stalk - y) / (H - stalk - top), wv = Math.sin(t * Math.PI) * (W * 0.42);
    const x = cx + lean * (0.3 + t * 0.7);
    S.line(x, y, x - wv, y - 2, m, 2); S.line(x, y, x + wv, y - 2, m, 3);
  }
  S.stem([[cx + lean * 0.3, H - stalk], [cx + lean, top]], () => 1.4, m, 1);
}

function hydroid(S: Pix, r: Rng) { featherAlgae(S, r, '#c8b890'); }
function wrack(S: Pix, r: Rng, base: string) {
  // bladder wrack: forked flat straps with paired air bladders
  const m = S.mat(hueRamp(base, 5)), bl = S.mat(hueRamp(base, 4, { spread: 1.3 }));
  const W = S.w, H = S.h;
  const fork = (x: number, y: number, ang: number, L: number, d: number) => {
    const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
    S.blade([[x, y], [(x + ex) / 2 + Math.sin(d + ang) * 1.5, (y + ey) / 2], [ex, ey]], () => 3.4 - d * 0.4, m, { rib: 'dark', rim: d > 1 });
    if (d > 0 && r.chance(0.6)) { const mx = (x + ex) / 2, my = (y + ey) / 2; S.ball(mx - 2, my, 1.6, bl); S.ball(mx + 2, my, 1.6, bl); }
    if (d < 3) { fork(ex, ey, ang - r.range(0.3, 0.5), L * 0.8, d + 1); fork(ex, ey, ang + r.range(0.3, 0.5), L * 0.8, d + 1); }
  };
  fork(W / 2, H - 1, -Math.PI / 2 + r.range(-0.2, 0.2), H * 0.3, 0);
}
function softCoral(S: Pix, r: Rng, base: string) {
  const m = S.mat(hueRamp(base, 5, { spread: 1.1 })), dot = S.mat(hueRamp('#ffffff', 3, { lo: 0.7 }));
  const W = S.w, H = S.h;
  const grow = (x: number, y: number, ang: number, L: number, d: number) => {
    const ex = x + Math.cos(ang) * L, ey = y + Math.sin(ang) * L;
    S.blade([[x, y], [ex, ey]], () => 4 - d, m, { rim: false });
    if (d >= 2) { S.ball(ex, ey, r.range(2.6, 3.6), m); return; }
    for (let k = 0; k < 2 + (d === 0 ? 1 : 0); k++) grow(ex, ey, ang + r.range(-0.8, 0.8), L * 0.7, d + 1);
  };
  grow(W / 2, H - 1, -Math.PI / 2, H * 0.35, 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (S.get(x, y) === m && (x * 7 + y * 3) % 9 === 0) S.set(x, y, dot, 1);
}
function glassSponge(S: Pix, r: Rng, base: string) {
  const m = S.mat(hueRamp(base, 4, { spread: 1.2 }));
  const W = S.w, H = S.h, cx = W / 2;
  const top = r.range(2, 6);
  for (let y = H - 1; y > top; y--) {
    const t = (H - 1 - y) / (H - 1 - top), hw = 2 + t * (W * 0.42 - 2);
    for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const u = x - cx;
      const lattice = ((Math.round(u + y) % 4) === 0) || ((Math.round(u - y) % 4 + 4) % 4 === 0) || y % 7 === 0 || Math.abs(Math.abs(u) - hw) < 1;
      if (lattice) S.set(x, y, m, u < 0 ? 3 : 2);
    }
  }
}
function tubeWorms(S: Pix, r: Rng) {
  const tube = S.mat(hueRamp('#e4ddca', 4)), plume = S.mat(hueRamp('#e8302c', 5, { spread: 1.3 }));
  const W = S.w, H = S.h;
  const n = r.int(6, 9);
  const ws = Array.from({ length: n }, () => ({ x: W / 2 + r.range(-W * 0.32, W * 0.32), L: r.range(H * 0.45, H - 6), lean: r.range(-3, 3) })).sort((a, b) => b.L - a.L);
  for (const w of ws) {
    const path = curve([[w.x, H - 1], [w.x + w.lean * 0.3, H - w.L * 0.5], [w.x + w.lean, H - w.L]], 12);
    S.blade(path, () => 3.4, tube, { rim: false, wrinkle: 4 });
    const tp = path[path.length - 1];
    for (let k = 0; k < 5; k++) S.blade([[tp[0], tp[1]], [tp[0] + (k - 2) * 1.6, tp[1] - 4.5]], (t) => 2.4 - t, plume, { rim: false });
  }
}
function crinoid(S: Pix, r: Rng, base: string) {
  const m = S.mat(hueRamp(base, 5));
  const W = S.w, H = S.h, cx = W / 2 + r.range(-2, 2);
  const cy = H * r.range(0.3, 0.45);
  S.stem(curve([[cx, H - 1], [cx + r.range(-3, 3), (H + cy) / 2], [cx, cy]], 12), () => 1.4, m, -1);
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI + (i / 9) * Math.PI + r.range(-0.1, 0.1), L = r.range(W * 0.3, W * 0.45);
    const path = curve([[cx, cy], [cx + Math.cos(a) * L * 0.5, cy + Math.sin(a) * L * 0.6 - 3], [cx + Math.cos(a) * L, cy + Math.sin(a) * L * 0.4 + 2]], 10);
    S.stem(path, () => 1.2, m, i % 2);
    for (let k = 1; k < path.length; k += 2) { const { p, d } = along(path, k / (path.length - 1)); S.set(p[0] - d[1] * 1.5, p[1] + d[0] * 1.5, m, 3); S.set(p[0] + d[1] * 1.5, p[1] - d[0] * 1.5, m, 2); }
  }
}
function bacteriaMat(S: Pix, r: Rng) {
  const m = S.mat(hueRamp('#e8c070', 4, { spread: 1.2 }));
  const W = S.w, H = S.h;
  for (let i = 0; i < 6; i++) { const x = r.range(W * 0.15, W * 0.85), w = r.range(4, W * 0.3); S.poly([[x - w, H - 1], [x - w * 0.6, H - r.range(2, 4)], [x + w * 0.5, H - r.range(2, 5)], [x + w, H - 1]], m, 1 + (i % 3)); }
  for (let x = 2; x < W - 2; x += 3) if (S.get(x, H - 2)) S.line(x, H - 2, x + r.range(-1, 1), H - r.range(4, 7), m, 3);
}

// ------------------------------------------------------------------ species table
const SP: Record<string, SpriteSpecies> = {
  giantkelp: { id: 'giantkelp', w: 100, h: 280, ppm: 24, n: 5, flex: 0.11, tall: true, paint: (S, r, a) => giantKelp(S, r, a) },
  bullkelp: { id: 'bullkelp', w: 150, h: 230, ppm: 24, n: 4, flex: 0.14, tall: true, paint: (S, r) => bullKelp(S, r) },
  eelgrass: { id: 'eelgrass', w: 34, h: 34, ppm: 24, n: 8, flex: 0.16, paint: (S, r) => eelgrass(S, r) },
  sealettuce: { id: 'sealettuce', w: 44, h: 32, ppm: 24, n: 6, flex: 0.08, paint: (S, r) => seaLettuce(S, r) },
  sargassum: { id: 'sargassum', w: 44, h: 52, ppm: 24, n: 6, flex: 0.14, paint: (S, r) => sargassum(S, r) },
  featheralgae: { id: 'featheralgae', w: 38, h: 34, ppm: 24, n: 6, flex: 0.1, paint: (S, r) => featherAlgae(S, r) },
  seafan: { id: 'seafan', w: 44, h: 38, ppm: 24, n: 6, flex: 0.06, paint: (S, r, _a, k) => seaFan(S, r, ['#8a3a9e', '#c0443a', '#d88a2a'][k % 3]) },
  tubesponge: { id: 'tubesponge', w: 32, h: 32, ppm: 24, n: 6, flex: 0.02, paint: (S, r, _a, k) => tubeSponge(S, r, ['#d86a2a', '#8a4ab0', '#c8a838'][k % 3]) },
  plumose: { id: 'plumose', w: 26, h: 30, ppm: 24, n: 6, flex: 0.05, paint: (S, r, a, k) => plumose(S, r, a.id === 'arctic' && k % 2 ? '#e88a4a' : '#d8d2c4') },
  seawhip: { id: 'seawhip', w: 30, h: 40, ppm: 24, n: 6, flex: 0.18, paint: (S, r, a) => seaWhip(S, r, a.id === 'graveyard' ? '#c88a3a' : '#d86a2a') },
  seapen: { id: 'seapen', w: 14, h: 22, ppm: 24, n: 6, flex: 0.05, paint: (S, r) => seaPen(S, r, '#e0a070') },
  seapenGlow: { id: 'seapenGlow', w: 14, h: 24, ppm: 24, n: 5, flex: 0.05, glow: 3.5, paint: (S, r) => seaPen(S, r, '#48c8e8', true) },
  hydroid: { id: 'hydroid', w: 24, h: 20, ppm: 24, n: 6, flex: 0.06, paint: (S, r) => hydroid(S, r) },
  wrack: { id: 'wrack', w: 34, h: 34, ppm: 24, n: 6, flex: 0.1, paint: (S, r, a) => wrack(S, r, a.id === 'arctic' ? '#7a6a3a' : '#7a6420') },
  softcoralCold: { id: 'softcoralCold', w: 26, h: 24, ppm: 24, n: 6, flex: 0.03, paint: (S, r, _a, k) => softCoral(S, r, ['#e88a9a', '#ece6da', '#e8904a'][k % 3]) },
  softcoral: { id: 'softcoral', w: 26, h: 24, ppm: 24, n: 6, flex: 0.03, paint: (S, r, _a, k) => softCoral(S, r, ['#d8507a', '#e88a3a', '#9a5ad0'][k % 3]) },
  glasssponge: { id: 'glasssponge', w: 24, h: 34, ppm: 24, n: 4, flex: 0.02, paint: (S, r, a) => glassSponge(S, r, a.glow ? '#8ad8f0' : '#d8dcd0') },
  tubeworms: { id: 'tubeworms', w: 26, h: 30, ppm: 24, n: 5, flex: 0.03, glow: 1.6, paint: (S, r) => tubeWorms(S, r) },
  glowcoral: { id: 'glowcoral', w: 28, h: 28, ppm: 24, n: 6, flex: 0.02, glow: 4, paint: (S, r, _a, k) => softCoral(S, r, k % 2 ? '#e05ad8' : '#3ad0f0') },
  crinoid: { id: 'crinoid', w: 30, h: 30, ppm: 24, n: 5, flex: 0.08, paint: (S, r, a) => crinoid(S, r, a.glow ? '#b060e0' : '#d08a3a') },
  bacteriaMat: { id: 'bacteriaMat', w: 40, h: 10, ppm: 24, n: 4, flex: 0, glow: 1.4, paint: (S, r) => bacteriaMat(S, r) },
};

// ------------------------------------------------------------------ seabed details (32 px/m)
function shell(S: Pix, r: Rng) {
  const pink = r.chance(0.5), m = S.mat(hueRamp(pink ? '#e0a090' : '#e4d4b8', 5));
  const W = S.w, H = S.h, cx = W / 2, by = H - 2;
  if (r.chance(0.6)) {
    // scallop: a ribbed fan with ears
    const R = W * 0.42;
    for (let k = 0; k < 9; k++) { const a = Math.PI * (1.08 + 0.84 * k / 8); S.blade([[cx, by], [cx + Math.cos(a) * R, by + Math.sin(a) * R * 0.85]], (t) => 1 + t * 2.4, m, { rim: false, bias: k % 2 ? 0 : -1 }); }
    S.poly([[cx - 3, by], [cx + 3, by], [cx + 2, by - 2], [cx - 2, by - 2]], m, 1);
  } else {
    // conch: a spiral cone lying on its side
    for (let k = 0; k < 4; k++) S.ball(cx - 4 + k * 2.6, by - 2.5 + k * 0.3, 3.2 - k * 0.6, m, { bias: k % 2 ? 0 : 1 });
    S.line(cx - 6, by - 2, cx - 1, by - 4, m, 1);
  }
}
function starfish(S: Pix, r: Rng) {
  const m = S.mat(hueRamp(r.pick(['#e0682a', '#a83a7a', '#d8a030']), 5));
  const W = S.w, H = S.h, cx = W / 2, cy = H / 2 + 1, R = W * 0.46, rot = r.range(0, 1);
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + rot + (k / 5) * TAU; S.blade([[cx, cy], [cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.5], [cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.85]], (t) => 4.2 * (1 - t * 0.7), m, { rim: false, rib: 'light' }); }
  S.ball(cx, cy, 2.6, m, { spec: false });
}
function urchin(S: Pix, r: Rng) {
  const body = S.mat(hueRamp(r.pick(['#4a2058', '#2a1a3a', '#8a3a4a']), 5)), sp = S.mat(hueRamp('#6a3a7a', 4));
  const W = S.w, H = S.h, cx = W / 2, cy = H - 4.5, R = 3.8;
  for (let k = 0; k < 16; k++) { const a = Math.PI + (k / 15) * Math.PI + r.range(-0.08, 0.08), L = R + r.range(3, 6); S.line(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8, cx + Math.cos(a) * L, cy + Math.sin(a) * L, sp, k < 8 ? 3 : 1); }
  S.ball(cx, cy, R, body, { ry: R * 0.85 });
}
function anemoneSmall(S: Pix, r: Rng) {
  const col = r.pick(['#d84a8a', '#5aa04a', '#e8784a', '#c8a0e0']);
  const body = S.mat(hueRamp(col, 4, { spread: 0.7 })), tent = S.mat(hueRamp(col, 5, { spread: 1.3 }));
  const W = S.w, H = S.h, cx = W / 2, cy = H - 6;
  S.blade([[cx, H - 1], [cx, cy]], (t) => 6 - t, body, { rim: false, wrinkle: 3 });
  // tentacles splay out and curl back, tips swollen and bright
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = Math.PI * (1.0 + 1.0 * k / (n - 1)), L = r.range(5.5, 8);
    const curl = (k < n / 2 ? -1 : 1) * r.range(0.4, 0.9);
    const p1: P2 = [cx + Math.cos(a) * L * 0.55, cy + Math.sin(a) * L * 0.55];
    const p2: P2 = [cx + Math.cos(a + curl * 0.6) * L, cy + Math.sin(a + curl * 0.6) * L * 0.8 + 1.5];
    const path = curve([[cx + Math.cos(a) * 1.5, cy], p1, p2], 8);
    S.blade(path, (t) => 1.8 - t * 0.6, tent, { rim: false, bias: k % 2 ? 0 : -1 });
    S.set(p2[0], p2[1], tent, 4);
  }
}
function fishBones(S: Pix, r: Rng) {
  const m = S.mat(hueRamp('#ddd6c2', 4));
  const W = S.w, H = S.h, y = H / 2 + r.range(-1, 1);
  S.line(4, y, W - 6, y, m, 2);
  for (let x = 7; x < W - 8; x += 2) { S.line(x, y, x - 2, y - 3, m, 3); S.line(x, y, x - 2, y + 3, m, 1); }
  S.ball(W - 5, y, 3, m); S.set(W - 4, y - 1, m, 0);
  S.poly([[0, y - 3], [4, y], [0, y + 3]], m, 2);
}
function tinCan(S: Pix, r: Rng) {
  const tin = S.mat(hueRamp('#9aa0a4', 5)), label = S.mat(hueRamp(r.pick(['#c03a2a', '#2a6ab0', '#d8b030']), 4)), rust = S.mat(hueRamp('#8a4a22', 4));
  const W = S.w, H = S.h, x0 = 3, x1 = W - 4, y0 = H - 8, y1 = H - 2;
  // lying on its side: a cylinder seen from the side, label band, rusty end
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const t = (y - y0) / (y1 - y0); S.set(x, y, tin, t < 0.25 ? 4 : t < 0.55 ? 3 : t < 0.85 ? 2 : 1); }
  for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 3; x <= x1 - 3; x++) { const t = (y - y0) / (y1 - y0); S.set(x, y, label, t < 0.3 ? 3 : t < 0.7 ? 2 : 1); }
  for (let y = y0; y <= y1; y++) { S.set(x1 + 1, y, tin, 1); S.set(x1 + 2, y, tin, y === y0 || y === y1 ? 0 : 2); }
  for (let k = 0; k < 4; k++) S.set(x0 + 1 + k * 2, y1 - (k % 2), rust, 2);
  S.line(x0 + 4, y0 + 3, x1 - 4, y0 + 3, label, 3);
}
function sandDollar(S: Pix, r: Rng) {
  const m = S.mat(hueRamp('#d8ccb0', 4));
  const W = S.w, H = S.h, cx = W / 2, cy = H - 4;
  S.ball(cx, cy, W * 0.4, m, { ry: 3, spec: false });
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + (k / 5) * TAU; S.set(cx + Math.cos(a) * 2.2, cy + Math.sin(a) * 1.4, m, 0); }
  void r;
}

const DETAIL: Record<string, SpriteSpecies> = {
  shell: { id: 'shell', w: 14, h: 10, ppm: 32, n: 6, flex: 0, paint: (S, r) => shell(S, r) },
  starfish: { id: 'starfish', w: 14, h: 12, ppm: 32, n: 5, flex: 0, paint: (S, r) => starfish(S, r) },
  urchin: { id: 'urchin', w: 18, h: 13, ppm: 32, n: 5, flex: 0, paint: (S, r) => urchin(S, r) },
  anemoneSmall: { id: 'anemoneSmall', w: 22, h: 16, ppm: 32, n: 6, flex: 0.03, paint: (S, r) => anemoneSmall(S, r) },
  fishBones: { id: 'fishBones', w: 18, h: 10, ppm: 32, n: 3, flex: 0, paint: (S, r) => fishBones(S, r) },
  tinCan: { id: 'tinCan', w: 14, h: 10, ppm: 32, n: 3, flex: 0, paint: (S, r) => tinCan(S, r) },
  sandDollar: { id: 'sandDollar', w: 12, h: 8, ppm: 32, n: 2, flex: 0, paint: (S, r) => sandDollar(S, r) },
};

export const SPRITES: Record<string, SpriteSpecies> = { ...SP, ...DETAIL };

// ------------------------------------------------------------------ painting into the atlas + card soups
export interface SpriteVariant { uv: UVR; w: number; h: number; flex: number; glow: number }

export class SpriteKit {
  variants = new Map<string, SpriteVariant[]>();
  private card = new Map<number, Soup>();
  constructor(public atlas: Atlas, public area: AreaDef, public seed: number) {}

  get(id: string): SpriteVariant[] {
    let v = this.variants.get(id);
    if (v) return v;
    const sp = SPRITES[id];
    if (!sp) throw new Error('unknown sprite species ' + id);
    v = [];
    for (let k = 0; k < sp.n; k++) {
      const r = new Rng((this.seed * 31 + id.length * 977 + k * 7919) >>> 0);
      const uv = this.atlas.paint(`${id}#${k}`, sp.w, sp.h, (reg) => {
        const S = new Pix(sp.w, sp.h);
        sp.paint(S, r, this.area, k);
        S.outline();
        S.toRegion(reg);
      });
      v.push({ uv, w: sp.w / sp.ppm, h: sp.h / sp.ppm, flex: sp.flex, glow: sp.glow ?? 0 });
    }
    this.variants.set(id, v);
    return v;
  }

  /** a unit card (x -0.5..0.5, y 0..1, facing +z) cut into `segs` rows so it can bend; flex grows with height */
  cardSoup(segs: number): Soup {
    let s = this.card.get(segs);
    if (!s) {
      s = new Soup();
      for (let i = 0; i < segs; i++) {
        const y0 = i / segs, y1 = (i + 1) / segs;
        const f0 = Math.pow(y0, 1.4), f1 = Math.pow(y1, 1.4);
        s.quad([-0.5, y0, 0], [0.5, y0, 0], [0.5, y1, 0], [-0.5, y1, 0], { u0: 0, v0: y0, u1: 1, v1: y1 }, [1, 1, 1, 1], [f0, f0, f1, f1]);
      }
      this.card.set(segs, s);
    }
    return s;
  }
}
