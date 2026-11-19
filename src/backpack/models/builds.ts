// BUILD ITEMS: tomes, bubble pipe, mana geode, clam shield, war conch (mage / warrior); the tin megalodon, piranha jar,
// Gerald the crab, octopus pal, wind-up key, chum bucket (summoner); junk turret, net trap, sea mine, harpoon ballista,
// clockwork heart (tinkerer); venom vial, ink bomb, cutpurse pouch, bone dice (rogue).
import * as THREE from 'three';
import { B, mat, cbox, hull, rock, cyl, cone, tube, ext, ball, warp, torus, lathe, prism, oval, ico, TAU, type V2, type V3 } from './kit';
import { tx, PAL, pal, tc, type Pal, type Pt } from './paint';
import { fanShell, coin, corkMat, brilliant } from './parts';
import { S } from './shared';
import type { Build } from './types';
import { hash2 } from '../../core/math';

const rgb = (p: Pal, t: number) => tc(p, t);

/** an upright grimoire facing +z: tooled cover with an emblem, rounded spine, page block, metal corners, a clasp */
function tome(b: B, key: string, C: Pal, corner: THREE.Material, emblem: (p: Pt) => void, o: { glow?: string; ek?: number } = {}) {
  const T = tx('tome:' + key, 48, 80, (p) => {
    p.all(C, 3);
    p.creases(0, 0, 48, 64, C, 8, key.length);
    p.panel(0, 0, 48, 64, C, 3, { noFill: true, e: 2 });
    p.R(5, 5, 38, 1, C, 1.5); p.R(5, 58, 38, 1, C, 1.5); p.R(5, 5, 1, 54, C, 1.5); p.R(42, 5, 1, 54, C, 1.5);
    p.R(6, 6, 36, 1, C, 4.5); p.R(6, 6, 1, 52, C, 4.5);
    p.stitch(3, 3, 44, 3, rgb(C, 5), rgb(C, 0)); p.stitch(3, 60, 44, 60, rgb(C, 5), rgb(C, 0));
    emblem(p);
    // spine strip (64..80): raised bands
    p.R(0, 64, 48, 16, C, 2.5); for (const x of [6, 18, 30, 42]) { p.R(x, 64, 2, 16, C, 4.5); p.R(x + 2, 64, 1, 16, C, 1); }
  });
  const Pg = tx('tomePages', 32, 32, (p) => { p.all(PAL.paper, 4); for (let y = 0; y < 32; y += 2) p.R(0, y, 32, 1, PAL.paper, 3); p.R(0, 0, 32, 1, PAL.paper, 5); });
  const cov = mat('tome:' + key, T, { rough: 0.6, emissive: o.glow, ek: o.ek ?? 0 });
  const W = 0.8, H = 1.5, D = 0.36, th = 0.06;
  b.add(cbox(W, H, th, 0.02, { pz: T.r(0, 0, 48, 64), nz: T.r(0, 0, 48, 64), side: T.r(0, 64, 48, 16) }), cov, [0.02, 0, D / 2 - th / 2]);
  b.add(cbox(W, H, th, 0.02, { pz: T.r(0, 0, 48, 64), nz: T.r(0, 0, 48, 64), side: T.r(0, 64, 48, 16) }), cov, [0.02, 0, -D / 2 + th / 2]);
  b.add(cyl(D / 2, H, 8, { side: T.r(0, 64, 48, 16) }), cov, [-W / 2 + 0.04, 0, 0], [0, 0, 0], [0.6, 1, 1]);
  b.add(cbox(W - 0.06, H - 0.08, D - th * 2, 0.01, Pg.r(0, 0, 32, 32)), mat('tomePages', Pg, { rough: 0.9 }), [0.03, 0, 0]);
  for (const [x, y] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as V2[]) {
    if (x < 0) continue;
    b.add(hull([[W / 2 + 0.03, y * (H / 2 + 0.03), D / 2 + 0.02], [W / 2 + 0.03, y * (H / 2 + 0.03), -D / 2 - 0.02], [W / 2 - 0.16, y * (H / 2 + 0.03), D / 2 + 0.02], [W / 2 - 0.16, y * (H / 2 + 0.03), -D / 2 - 0.02], [W / 2 + 0.03, y * (H / 2 - 0.16), D / 2 + 0.02], [W / 2 + 0.03, y * (H / 2 - 0.16), -D / 2 - 0.02]]), corner, [0.02, 0, 0]);
  }
  for (const y of [1, -1]) b.add(hull([[-W / 2 - 0.02, y * (H / 2 + 0.03), D / 2 + 0.02], [-W / 2 + 0.16, y * (H / 2 + 0.03), D / 2 + 0.02], [-W / 2 - 0.02, y * (H / 2 - 0.16), D / 2 + 0.02], [-W / 2 - 0.02, y * (H / 2 + 0.03), D / 2 - 0.04], [-W / 2 + 0.16, y * (H / 2 + 0.03), D / 2 - 0.04], [-W / 2 - 0.02, y * (H / 2 - 0.16), D / 2 - 0.04]]), corner, [0.02, 0, 0]);
  // the clasp: a strap round the fore-edge with a metal latch on the cover
  b.add(cbox(0.14, 0.2, D + 0.06, 0.02), S.strap(), [W / 2 + 0.02, 0, 0]);
  b.add(cbox(0.2, 0.16, 0.05, 0.02), corner, [W / 2 - 0.06, 0, D / 2 + 0.03]);
}

export const BUILD_MODELS: Record<string, Build> = {
  // ---------------------------------------------------------------- tome of brine frost: ice-blue leather, a snowflake, icicles
  frostTome(b) {
    const ice = mat('iceSilver', tx('iceSilver', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.ice, { b: 3.5 }); p.panel(0, 0, 16, 16, PAL.ice, 3.5, { noFill: true }); p.glint(4, 4, 1); }), { rough: 0.2, metal: 0.5, emissive: '#64bce0', ek: 0.3 });
    tome(b, 'frost', pal('#3a7ab0'), ice, (p) => {
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; p.ln(24, 30, 24 + Math.cos(a) * 13, 30 + Math.sin(a) * 13, PAL.ice, 5); for (const k of [6, 10]) { const x = 24 + Math.cos(a) * k, y = 30 + Math.sin(a) * k; p.ln(x, y, x + Math.cos(a + 0.8) * 3, y + Math.sin(a + 0.8) * 3, PAL.ice, 4.5); p.ln(x, y, x + Math.cos(a - 0.8) * 3, y + Math.sin(a - 0.8) * 3, PAL.ice, 4.5); } }
      p.ellipse(24, 30, 3, 3, rgb(PAL.white, 5));
      for (let x = 2; x < 46; x += 3) p.R(x, 2, 2, 2 + (x % 5), PAL.white, 5);
    }, { glow: '#64bce0', ek: 0.25 });
    const icM = mat('icicle', tx('icicle', 8, 16, (p) => { p.all(PAL.ice, 4.5); p.R(1, 0, 2, 16, PAL.white, 5); p.R(6, 0, 2, 16, PAL.ice, 3); }), { rough: 0.1, emissive: '#a8e6fa', ek: 0.4 });
    for (const [x, l] of [[-0.24, 0.24], [-0.05, 0.16], [0.14, 0.3], [0.3, 0.14]] as V2[]) b.add(cone(0.045, l, 5), icM, [x, -0.76 - l / 2, 0.14], [Math.PI, 0, 0]);
    for (const [x, h, a] of [[-0.2, 0.18, 0.3], [0.05, 0.26, -0.1], [0.28, 0.16, -0.5]] as V3[]) b.add(prism(0.04, h, 5, 0.4), icM, [x, 0.74, 0.1], [0, 0, a]);
  },

  // ---------------------------------------------------------------- the eel-skin grimoire: spotted hide, a glowing bolt, gold corners, sparks
  stormTome(b) {
    const E = pal('#7a9a2a');
    tome(b, 'storm', E, S.gold(), (p) => {
      for (let i = 0; i < 22; i++) { const x = 4 + Math.floor(hash2(i, 1, 8) * 40), y = 4 + Math.floor(hash2(i, 2, 8) * 56); p.ellipse(x, y, 2, 1.5, rgb(PAL.kelp, 1)); }
      p.ellipse(24, 31, 15, 15, rgb(PAL.black, 2)); p.ellipse(24, 31, 15, 15, (nx, ny) => (Math.hypot(nx, ny) > 0.85 ? rgb(PAL.gold, 4) : null));
      p.bolt(15, 18, 18, 26, rgb(PAL.yellow, 4.5)); p.bolt(16, 19, 15, 22, rgb(PAL.yellow, 5));
    }, { glow: '#f0e040', ek: 0.35 });
    b.add(brilliant(0.08, 6), mat('purpleGem', tx('purpleGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.amethyst, 6)), { rough: 0.1, emissive: '#8236c0', ek: 0.8 }), [0.36, 0, 0.23]);
    const spark = mat('spark', tx('spark', 8, 8, (p) => { p.all(PAL.yellow, 5); p.R(2, 0, 3, 8, PAL.white, 5); }), { emissive: '#fff060', ek: 2 });
    for (const [x, y, a, s] of [[0.5, 0.6, -0.6, 1], [-0.5, -0.4, 2.4, 0.9], [0.52, -0.5, -2.2, 0.8]] as number[][]) {
      const k = b.sub([x, y, 0.1], [0, 0, a], s);
      k.add(hull([[0, 0, 0.02], [0, 0, -0.02], [0.06, 0.12, 0], [0.02, 0.08, 0], [0.04, 0.2, 0]]), spark);
      k.add(hull([[0.02, 0.08, 0.02], [0.02, 0.08, -0.02], [-0.04, 0.2, 0], [0.0, 0.3, 0]]), spark);
    }
  },

  // ---------------------------------------------------------------- a bubble pipe: a whelk-shell bowl on a briar stem, bubbles rising
  bubblePipe(b) {
    const Sh = tx('pipeShell', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const k = (((x / 32) - (1 - y / 32) * 2.5) % 1 + 1) % 1; p.t(x, y, PAL.shell, k < 0.12 ? 2 : k < 0.3 ? 4.5 : 3.5); }
      p.R(0, 0, 32, 3, PAL.pink, 4);
    });
    const shell = mat('pipeShell', Sh, { rough: 0.45 });
    const bowl = warp(lathe([[0, -0.32], [0.14, -0.3], [0.26, -0.12], [0.28, 0.14], [0.24, 0.28], [0.2, 0.28], [0.16, 0.0], [0, -0.06]], 12, { side: Sh.r(0, 0, 32, 32) }), (v) => { const a = Math.atan2(v.x, v.z) / TAU, t = ((a - (v.y + 0.32) / 0.6 * 1.6) % 1 + 1) % 1; const k = 1 + 0.12 * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8) - 0.06; v.x *= k; v.z *= k; });
    b.add(bowl, shell, [0.55, 0.0, 0], [0.25, 0, -0.1], 1, { smooth: 0.6 });
    b.add(cyl(0.2, 0.01, 10), mat('pipeFoam', tx('pipeFoam', 16, 16, (p) => { p.all(PAL.aqua, 4.5); for (const [x, y] of [[4, 4], [10, 6], [6, 11], [12, 12]]) p.ellipse(x, y, 2, 2, rgb(PAL.white, 5)); }), { rough: 0.2, emissive: '#5ad2be', ek: 0.4 }), [0.55, 0.26, 0.04], [0.25, 0, -0.1]);
    const St = tx('briar', 64, 8, (p) => { p.wood(0, 0, 48, 8, pal('#5a2a1a'), { seed: 6, knots: 1 }); p.R(48, 0, 16, 8, PAL.black, 3); p.R(48, 1, 16, 1, PAL.black, 5); p.R(46, 0, 2, 8, PAL.gold, 4); });
    b.add(tube([[0.38, -0.12, 0], [0.1, -0.18, 0.02], [-0.3, -0.12, 0.03], [-0.62, 0.0, 0], [-0.92, 0.1, 0]], (t) => 0.07 - t * 0.025, { radial: 6, segs: 14, uv: St.r(0, 0, 64, 8) }), mat('briar', St, { rough: 0.5 }));
    const bub = mat('bubble', tx('bubble', 16, 16, (p) => { p.all(PAL.aqua, 4.5); p.R(0, 12, 16, 4, PAL.purple, 4.5); p.R(3, 3, 4, 3, PAL.white, 5); }), { rough: 0.1, opacity: 0.5, emissive: '#5ad2be', ek: 0.4, depthWrite: false });
    for (const [x, y, r] of [[0.5, 0.48, 0.1], [0.72, 0.62, 0.07], [0.4, 0.74, 0.055], [0.66, 0.86, 0.04]] as V3[]) b.add(ball(r, 10, 7), bub, [x, y, 0.06], [0, 0, 0], 1, { smooth: 1.4 });
  },

  // ---------------------------------------------------------------- a mana geode cracked open: a rough rind, agate bands, glowing crystals
  manaGeode(b) {
    const half = (pos: V3, rot: V3, s: number, key: string, crystals: boolean) => {
      const rind = tx('geodeRind', 48, 48, (p) => p.stone(0, 0, 48, 48, pal('#7a6658'), { cell: 8, seed: 21, cracks: 3 }));
      const cut = tx('geodeCut', 48, 48, (p) => { p.ellipse(24, 24, 24, 24, (nx, ny) => { const d = Math.hypot(nx, ny); return rgb(d > 0.94 ? pal('#7a6658') : d > 0.84 ? PAL.white : d > 0.8 ? PAL.mana : PAL.ice, d > 0.94 ? 2 : d > 0.84 ? 4.5 + (Math.floor(d * 60) % 2) * 0.5 : 4); }); });
      const inner = tx('geodeIn', 32, 32, (p) => { p.facets(0, 0, 16, 16, PAL.mana, 6); p.facets(16, 0, 16, 16, PAL.purple, 6); p.facets(0, 16, 16, 16, PAL.purple, 6); p.facets(16, 16, 16, 16, PAL.mana, 6); });
      const g = b.sub(pos, rot, s);
      const prof: V2[] = [[0, -0.74], [0.42, -0.62], [0.7, -0.32], [0.8, 0.0], [0.6, 0.0], [0.5, -0.24], [0.28, -0.42], [0, -0.48]];
      g.add(warp(lathe(prof.slice(0, 4), 12, { side: rind.r(0, 0, 48, 48) }), (v) => { const k = 1 + (hash2(Math.round(v.x * 40), Math.round(v.z * 40), 3) - 0.5) * 0.12; v.x *= k; v.z *= k; }), mat('geodeRind', rind, { rough: 0.9 }));
      g.add(lathe(prof.slice(3, 5), 12, { side: cut.r(0, 0, 48, 48), cap: cut.r(0, 0, 48, 48) }), mat('geodeCut', cut, { rough: 0.5 }));
      g.add(lathe(prof.slice(4), 12, { side: inner.r(0, 0, 32, 32) }), mat('geodeIn', inner, { rough: 0.2, emissive: '#5a6cf4', ek: 0.6 }));
      if (crystals) {
        const xt = mat('xtal:mana', tx('xtal:mana', 16, 32, (p) => { for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.t(x, y, PAL.mana, y < 6 ? 5 : y > 24 ? 2.5 : 3.5 + (x === 5 ? 1 : 0)); p.glint(5, 3, 1); }), { rough: 0.1, emissive: '#7aa8ff', ek: 0.9 });
        for (let i = 0; i < 12; i++) {
          const th = i * 2.39996 + 0.4, ph = 0.3 + (i % 4) * 0.25;
          const pt = new THREE.Vector3(Math.sin(ph) * Math.cos(th) * 0.5, -Math.cos(ph) * 0.44, Math.sin(ph) * Math.sin(th) * 0.5);
          const dir = new THREE.Vector3(0, 0.15, 0).sub(pt).normalize();
          const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
          g.add(prism(0.05 + (i % 3) * 0.015, 0.22 + (i % 4) * 0.06, 6, 0.35), xt, [pt.x, pt.y, pt.z], [e.x, e.y, e.z]);
        }
      }
      void key;
    };
    half([-0.12, -0.1, 0.1], [Math.PI / 2 - 0.25, 0, 0.1], 1, 'a', true);
    half([0.55, 0.52, -0.35], [-Math.PI / 2 + 0.7, 0.3, -0.5], 0.62, 'b', false);
  },

  // ---------------------------------------------------------------- half a giant clam as a shield: zigzag lip, silver boss, aquamarine
  clamShield(b) {
    const Cl = tx('clamOut', 40, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 40; x++) { const rib = Math.floor(x / 4) % 2; p.t(x, y, rib ? PAL.bone : pal('#c8b490'), rib ? 4 : 3 + (Math.floor((47 - y) / 4) % 2) * 0.5); }
      for (let y = 4; y < 48; y += 6) for (let x = 0; x < 40; x += 4) { p.R(x, y, 3, 1, PAL.bone, 5); p.t(x + 1, y + 1, PAL.bone, 2); }
      p.R(0, 0, 40, 3, PAL.purple, 3.5);
    });
    const In = tx('clamIn', 16, 16, (p) => { p.nacre(0, 0, 16, 16, 3, 0.6); });
    fanShell(b, mat('clamOut', Cl, { rough: 0.55 }), mat('clamIn', In, { rough: 0.3 }), { R: 0.95, spread: 0.85, ribs: 5, dome: 0.3, rib: 0.07, scallop: 0.1, pos: [0, -0.9, 0], s: [1, 1.85, 1], nv: 4 });
    b.add(cyl(0.16, 0.08, 10, { ch: 0.03 }), S.chrome(), [0, 0.1, 0.32], [Math.PI / 2, 0, 0]);
    b.add(brilliant(0.08, 8), mat('aquaGem', tx('aquaGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.aqua, 8)), { rough: 0.1, emissive: '#28b2b8', ek: 0.8 }), [0, 0.1, 0.38]);
    for (const y of [-0.45, 0.42]) b.add(cbox(0.9, 0.08, 0.04, 0.015), S.strap(), [0, y, 0.26 - Math.abs(y) * 0.12]);
  },

  // ---------------------------------------------------------------- a war conch: spiky shoulder, pink flare, brass mouthpiece, red war paint
  warConch(b) {
    const C = tx('conch', 48, 48, (p) => {
      for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) { const k = (((x / 48) - (1 - y / 48) * 3) % 1 + 1) % 1; p.t(x, y, PAL.shell, k < 0.1 ? 2 : k < 0.25 ? 4.5 : 3.5); }
      for (const y of [22, 30]) { p.R(0, y, 48, 3, PAL.red, 3); p.R(0, y, 48, 1, PAL.red, 4.5); }
    });
    // the shell lies on its side: spire (with the brass mouthpiece) to the left, the flared pink mouth to the right
    const g = b.sub([0.0, 0, 0], [0.35, 0, Math.PI / 2]);
    g.add(warp(lathe([[0, -0.86], [0.1, -0.72], [0.26, -0.36], [0.38, 0.04], [0.36, 0.22], [0.22, 0.46], [0.1, 0.72], [0, 0.86]], 12, { side: C.r(0, 0, 48, 48) }), (v) => { const a = Math.atan2(v.x, v.z) / TAU, t = ((a - (v.y + 0.86) / 1.72 * 3) % 1 + 1) % 1; const k = 1 + 0.12 * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8) - 0.06; v.x *= k; v.z *= k; }), mat('conch', C, { rough: 0.45 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.5 });
    const knob = mat('conchKnob', tx('conchKnob', 8, 8, (p) => { p.all(PAL.shell, 4); p.R(0, 0, 8, 3, PAL.shell, 5); }), { rough: 0.5 });
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + 0.3; g.add(cone(0.07, 0.22, 5), knob, [Math.sin(a) * 0.36, 0.16, Math.cos(a) * 0.36], [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9]); }
    const L = tx('conchLip', 32, 32, (p) => { p.all(PAL.pink, 4); p.ellipse(18, 16, 10, 13, rgb(PAL.pink, 2.5)); p.ellipse(19, 16, 6, 9, rgb(PAL.pink, 1.5)); p.R(2, 2, 2, 24, PAL.white, 5); p.R(28, 4, 2, 24, PAL.pink, 5); });
    b.add(warp(ext([[-0.3, 0.32], [0.0, 0.42], [0.3, 0.3], [0.42, 0.0], [0.3, -0.3], [0.0, -0.38], [-0.3, -0.26], [-0.36, 0.0]], 0.06, 0.02, { rects: L.r(0, 0, 32, 32) }), (v) => { v.z -= (v.x * v.x + v.y * v.y) * 0.5; }), mat('conchLip', L, { rough: 0.25, emissive: '#963456', ek: 0.15 }), [0.5, -0.04, 0.12], [0, -0.75, 0]);
    g.add(cyl(0.07, 0.2, 8, { ch: 0.02, rTop: 0.1 }), S.brass(), [0, 0.94, 0]);
    g.add(torus(0.08, 0.025, 4, 10), S.brass(), [0, 1.04, 0], [Math.PI / 2, 0, 0]);
    b.add(tube([[-0.92, 0.05, 0.05], [-0.6, -0.38, 0.25], [0.0, -0.46, 0.3], [0.46, -0.26, 0.24]], 0.035, { radial: 4, segs: 12, sx: 0.4 }), S.strap());
  },

  // ---------------------------------------------------------------- a tin wind-up megalodon: lithographed teeth, gold seams, a big gold key
  windUpMegalodon(b) {
    const SH = pal('#5a6e82');
    const T = tx('tinShark', 64, 48, (p) => {
      // u around: 0 = near flank, 16 = belly, 32 = far flank, 48 = back; v (painter y) runs nose (top) -> tail (bottom)
      for (let x = 0; x < 64; x++) { const k = Math.cos(((x - 48) / 64) * TAU); for (let y = 0; y < 48; y++) p.t(x, y, k > -0.3 ? SH : PAL.white, k > 0.45 ? 2.5 : k > -0.3 ? 3.5 : 4.5); }
      // the tin seam along each flank with gold tabs
      for (const sx of [0, 32]) { p.R(sx + 8, 0, 1, 48, PAL.gold, 4); for (let y = 4; y < 48; y += 9) p.R(sx + 7, y, 3, 2, PAL.gold, 5); }
      for (const cx of [2, 34]) {
        // the printed jaws: a red gape with white teeth, right at the nose
        p.poly([[cx, 4], [cx + 22, 2], [cx + 22, 16], [cx, 12]], rgb(PAL.red, 2));
        p.poly([[cx, 7], [cx + 22, 7], [cx + 22, 11], [cx, 10]], rgb(PAL.ink, 0.5));
        for (let i = 0; i < 7; i++) { p.poly([[cx + 1 + i * 3, 4.5], [cx + 4 + i * 3, 4.5], [cx + 2.5 + i * 3, 9]], rgb(PAL.white, 5)); p.poly([[cx + 1 + i * 3, 12.5], [cx + 4 + i * 3, 12.5], [cx + 2.5 + i * 3, 8.5]], rgb(PAL.white, 4.5)); }
        p.ellipse(cx + 10, 21, 3.4, 3.4, rgb(PAL.white, 5)); p.ellipse(cx + 10.6, 21.4, 2, 2, rgb(PAL.ink, 0)); p.t(cx + 9, 20, PAL.white, 5);
        for (let i = 0; i < 4; i++) p.R(cx + 15 + i * 3, 19, 1, 8, SH, 0.5);
      }
    });
    const tin = mat('tinShark', T, { rough: 0.55, metal: 0.25 });
    const body = b.sub([0, 0.02, 0], [0, 0, -Math.PI / 2]);
    body.add(warp(lathe([[0, -0.98], [0.06, -0.88], [0.15, -0.5], [0.27, -0.05], [0.31, 0.3], [0.25, 0.6], [0.12, 0.84], [0, 0.98]], 12, { side: T.r(0, 0, 64, 48) }), (v) => { v.z *= 0.7; if (v.y > 0.5) v.x -= (v.y - 0.5) * 0.25; }), tin, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.55 });
    const finT = tx('tinFin', 16, 16, (p) => { p.all(SH, 3); p.R(0, 0, 16, 2, PAL.gold, 4.5); p.R(0, 14, 16, 2, SH, 2); });
    const fin = mat('tinFin', finT, { rough: 0.3, metal: 0.45 });
    b.add(ext([[-0.24, 0], [0.2, 0], [-0.08, 0.46], [-0.18, 0.42]], 0.05, 0.015), fin, [0.02, 0.22, 0]);
    b.add(ext([[0, 0], [0.12, -0.04], [0.42, 0.44], [0.3, 0.46], [0.08, 0.1], [0.36, -0.36], [0.24, -0.36]], 0.05, 0.015), fin, [-0.98, 0.0, 0]);
    for (const z of [1, -1]) b.add(ext([[0, 0], [0.26, 0.02], [0.06, -0.28]], 0.04, 0.012), fin, [0.22, -0.16, z * 0.17], [z * 0.6, 0, -0.3]);
    // the big gold wind-up key in its side, and tin wheels underneath
    const key = b.sub([-0.25, 0.06, 0.2], [Math.PI / 2, 0, 0]);
    key.add(cyl(0.035, 0.22, 6), S.gold(), [0, 0.1, 0]);
    key.add(ext([[-0.26, 0.06], [-0.1, 0.04], [0.1, 0.04], [0.26, 0.06], [0.3, 0.0], [0.26, -0.06], [0.1, -0.04], [-0.1, -0.04], [-0.26, -0.06], [-0.3, 0.0]], 0.05, 0.015, { holes: [oval(-0.2, 0, 0.05, 0.03, 6).reverse(), oval(0.2, 0, 0.05, 0.03, 6).reverse()] }), S.gold(), [0, 0.24, 0], [Math.PI / 2, 0, 0]);
    for (const x of [-0.45, 0.4]) for (const z of [1, -1]) b.add(cyl(0.07, 0.04, 8, { ch: 0.01 }), S.chrome(), [x, -0.3, z * 0.13], [Math.PI / 2, 0, 0]);
  },

  // ---------------------------------------------------------------- a piranha in a jar: punched lid, a DANGER label, teeth against the glass
  piranhaJar(b) {
    b.add(lathe([[0, -0.82], [0.36, -0.82], [0.4, -0.76], [0.4, 0.4], [0.3, 0.56], [0.26, 0.6], [0.26, 0.66], [0, 0.66]], 12), S.glass(), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.6 });
    const water = mat('jarWater', tx('jarWater', 16, 16, (p) => { p.all(PAL.teal, 3.5); p.R(0, 0, 16, 2, PAL.teal, 5); }), { rough: 0.2, opacity: 0.35, emissive: '#14706a', ek: 0.3, depthWrite: false });
    b.add(cyl(0.37, 1.02, 12), water, [0, -0.3, 0]);
    // the lid: punched tin
    const Ld = tx('jarLid', 32, 32, (p) => { p.metal(0, 0, 32, 32, PAL.silver, { b: 3 }); for (const [x, y] of [[10, 10], [20, 12], [14, 20], [22, 22], [8, 22]] as V2[]) { p.R(x, y, 2, 2, PAL.ink, 0); p.t(x, y + 2, PAL.silver, 5); } for (let x = 0; x < 32; x += 2) p.R(x, 0, 1, 4, PAL.silver, 1.5); });
    b.add(cyl(0.3, 0.14, 12, { ch: 0.02, side: Ld.r(0, 0, 32, 4), cap: Ld.r(0, 0, 32, 32) }), mat('jarLid', Ld, { rough: 0.35, metal: 0.55 }), [0, 0.72, 0]);
    // the label wrapped round the front
    const Lb = tx('jarLabel', 32, 16, (p) => { p.all(PAL.paper, 4.5); p.R(0, 0, 32, 2, PAL.red, 3); p.R(0, 14, 32, 2, PAL.red, 3); p.text('DANGER', 4, 5, rgb(PAL.red, 2.5)); });
    b.add(lathe([[0.41, -0.62], [0.41, -0.34]], 6, { arc: 1.5, phase: -0.75, side: Lb.r(0, 0, 32, 16) }), mat('jarLabel', Lb, { rough: 0.8, side: THREE.DoubleSide }));
    // the piranha: grey back, red belly, a furious underbite
    const F = tx('piranha', 48, 16, (p) => {
      for (let x = 0; x < 48; x++) { const k = Math.cos(((x - 36) / 48) * TAU); for (let y = 0; y < 16; y++) p.t(x, y, k < -0.3 ? PAL.red : PAL.silver, k < -0.3 ? 3.5 : k > 0.5 ? 2.5 : 3.5); }
      for (let y = 0; y < 16; y += 3) for (let x = (y % 6) ? 1 : 0; x < 48; x += 3) p.t(x, y, PAL.silver, 4.5);
    });
    const fish = b.sub([0, 0.0, 0.02], [0, -0.4, 0.15]);
    fish.add(warp(lathe([[0, -0.3], [0.12, -0.22], [0.2, 0.0], [0.17, 0.18], [0.07, 0.3], [0, 0.32]], 10, { side: F.r(0, 0, 48, 16) }), (v) => { v.z *= 0.55; v.x *= 1.15; }), mat('piranha', F, { rough: 0.4, metal: 0.2 }), [0, 0, 0], [0, 0, -Math.PI / 2], 1, { smooth: 0.6 });
    fish.add(ext([[0, 0], [0.18, 0.16], [0.16, -0.16]], 0.03, 0.01), mat('piranhaFin', tx('piranhaFin', 8, 8, (p) => { p.all(PAL.red, 2.5); p.R(0, 0, 8, 2, PAL.red, 4); }), { rough: 0.5 }), [-0.32, 0, 0]);
    fish.add(ball(0.045, 6, 4), mat('piranhaEye', tx('piranhaEye', 8, 8, (p) => { p.all(PAL.orange, 4.5); p.R(3, 3, 3, 3, PAL.ink, 0); p.t(3, 3, PAL.white, 5); }), { rough: 0.2 }), [0.2, 0.06, 0.09]);
    const tooth = mat('piranhaTooth', tx('piranhaTooth', 4, 4, (p) => p.all(PAL.white, 5)), { rough: 0.3 });
    for (let i = 0; i < 4; i++) fish.add(cone(0.018, 0.05, 3), tooth, [0.24 + i * 0.022, -0.05, 0.05 - i * 0.025], [0, 0, 0]);
    fish.add(cbox(0.14, 0.04, 0.14, 0.01), mat('piranha', F), [0.27, -0.07, 0]);
  },

  // ---------------------------------------------------------------- Gerald: a cheerful red crab, claws up, eyes on stalks, a name tag
  petCrab(b) {
    const C = tx('gerald', 32, 32, (p) => {
      p.all(PAL.coral, 3.5); p.R(0, 0, 32, 8, PAL.coral, 4.5); p.R(0, 24, 32, 8, PAL.orange, 4);
      for (const [x, y] of [[6, 10], [14, 6], [22, 10], [10, 16], [20, 16]] as V2[]) { p.t(x, y, PAL.white, 5); p.t(x + 1, y + 1, PAL.coral, 1.5); }
      for (let i = 0; i < 9; i++) p.t(11 + i, 19 + Math.round(Math.sin((i / 8) * Math.PI) * 2), PAL.ink, 1);
    });
    const shell = mat('gerald', C, { rough: 0.45 });
    b.add(ball(0.3, 10, 6), shell, [0, -0.1, 0], [0.2, 0, 0], [1.3, 0.62, 0.95], { smooth: 0.9 });
    for (const sx of [-1, 1]) {
      b.add(cyl(0.025, 0.16, 5), shell, [sx * 0.1, 0.1, 0.12]);
      b.add(ball(0.065, 6, 5, [0, 0, 1, 1]), mat('crabEye', tx('crabEye', 16, 16, (p) => { p.all(PAL.white, 5); p.ellipse(9, 7, 4, 4, rgb(PAL.ink, 0)); p.R(8, 5, 2, 2, PAL.white, 5); }), { rough: 0.2 }), [sx * 0.1, 0.2, 0.14], [0, -0.4, 0]);
      // a raised claw on each side
      const arm = b.sub([sx * 0.36, -0.06, 0.06], [0, 0, 0]);
      arm.add(tube([[0, 0, 0], [sx * 0.08, 0.14, 0.02], [sx * 0.1, 0.26, 0.04]], 0.045, { radial: 5, segs: 6 }), shell);
      arm.add(ball(0.11, 6, 5), shell, [sx * 0.1, 0.36, 0.05], [0, 0, 0], [0.9, 1.1, 0.7], { smooth: 0.8 });
      arm.add(tube([[sx * 0.06, 0.44, 0.05], [sx * 0.02, 0.56, 0.05], [sx * -0.03, 0.6, 0.05]], (t) => 0.04 * (1 - t * 0.7), { radial: 4, segs: 5 }), shell);
      arm.add(tube([[sx * 0.14, 0.44, 0.05], [sx * 0.16, 0.58, 0.05], [sx * 0.12, 0.64, 0.05]], (t) => 0.04 * (1 - t * 0.7), { radial: 4, segs: 5 }), shell);
      for (let i = 0; i < 3; i++) b.add(tube([[sx * 0.3, -0.16, 0.08 - i * 0.12], [sx * 0.46, -0.12, 0.1 - i * 0.14], [sx * 0.54, -0.32, 0.12 - i * 0.16]], 0.025, { radial: 3, segs: 4 }), shell);
    }
    b.add(cyl(0.06, 0.015, 8), S.gold(), [0.0, -0.3, 0.27], [Math.PI / 2 - 0.3, 0, 0]);
  },

  // ---------------------------------------------------------------- an octopus pal: big eyes, a blush, eight arms curling out to the sides
  octopusPal(b) {
    const P = pal('#9a4ab8');
    const T = tx('octo', 32, 32, (p) => {
      for (let y = 0; y < 32; y++) p.R(0, y, 32, 1, P, y < 6 ? 4.5 : y > 24 ? 2.5 : 3.5);
      for (let i = 0; i < 12; i++) { const x = Math.floor(hash2(i, 1, 5) * 30), y = Math.floor(hash2(i, 2, 5) * 22); p.ellipse(x + 1, y + 1, 1.5, 1.5, rgb(P, 2)); }
    });
    const skin = mat('octo', T, { rough: 0.35 });
    b.add(ball(0.34, 10, 7), skin, [0, 0.12, 0], [0, 0, 0], [1, 1.12, 0.9], { smooth: 1.2 });
    const eye = mat('octoEye', tx('octoEye', 16, 16, (p) => { p.all(PAL.white, 5); p.ellipse(8, 9, 5, 5, rgb(PAL.ink, 0)); p.R(5, 5, 3, 3, PAL.white, 5); p.t(10, 11, PAL.white, 5); }), { rough: 0.15 });
    for (const x of [-0.14, 0.14]) { b.add(ball(0.1, 7, 5, [0, 0, 1, 1]), eye, [x, 0.06, 0.26], [0, x < 0 ? 0.4 : -0.4, 0], [1, 1.1, 0.6]); b.add(ball(0.05, 6, 4), mat('blush', tx('blush', 8, 8, (p) => p.all(PAL.pink, 4.5)), { rough: 0.6 }), [x * 1.7, -0.06, 0.24], [0, 0, 0], [1.3, 0.6, 0.4]); }
    const Ar = tx('octoArm', 48, 8, (p) => { p.all(P, 3.5); p.R(0, 0, 48, 2, P, 4.5); for (let x = 2; x < 48; x += 4) { p.ellipse(x, 6, 1.5, 1.2, rgb(PAL.pink, 4.5)); } });
    const arm = mat('octoArm', Ar, { rough: 0.4 });
    for (let i = 0; i < 8; i++) {
      const sx = i < 4 ? -1 : 1, k = i % 4, y0 = -0.12 - k * 0.03, z0 = 0.1 - k * 0.08;
      const L = 0.62 + (k % 2) * 0.16, yE = -0.3 + k * 0.12;
      const pts: V3[] = [[sx * 0.12, y0, z0], [sx * 0.4, y0 - 0.12, z0 + 0.04], [sx * (0.3 + L), yE, z0], [sx * (0.36 + L), yE + 0.16, z0 + 0.02], [sx * (0.26 + L), yE + 0.18, z0]];
      b.add(tube(pts, (t) => 0.075 * (1 - t * 0.8), { radial: 4, segs: 9, uv: Ar.r(0, 0, 48, 8) }), arm, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.9 });
    }
  },

  // ---------------------------------------------------------------- a brass butterfly wind-up key
  brassKey(b) {
    const T = tx('keyBrass', 48, 32, (p) => {
      p.metal(0, 0, 48, 32, PAL.brass, { b: 3.5 });
      for (const cx of [12, 36]) for (let i = 0; i < 20; i++) { const a = i * 0.5, r = 1 + i * 0.4; p.t(cx + Math.cos(a) * r, 16 + Math.sin(a) * r, PAL.brass, 1.5); }
      p.glint(8, 6, 1);
    });
    const brass = mat('keyBrass', T, { rough: 0.28, metal: 0.62 });
    // a butterfly key: two rounded wings off a collar, a shaft, a square socket
    const wing: V2[] = [[0.05, 0.07], [0.16, 0.2], [0.34, 0.25], [0.44, 0.14], [0.44, -0.14], [0.34, -0.25], [0.16, -0.2], [0.05, -0.07]];
    const k = b.sub([0.02, 0.0, 0], [0, 0, -0.55]);
    for (const sx of [1, -1]) k.add(ext(wing.map(([x, y]) => [x * sx, y] as V2), 0.07, 0.025, { holes: [oval(sx * 0.28, 0, 0.07, 0.09, 7).reverse()], rects: T.r(sx > 0 ? 24 : 0, 0, 24, 32) }), brass, [0, 0.26, 0]);
    k.add(cyl(0.08, 0.12, 8, { ch: 0.02 }), brass, [0, 0.16, 0]);
    k.add(cyl(0.045, 0.44, 6, { ch: 0.01 }), brass, [0, -0.1, 0]);
    k.add(cbox(0.11, 0.12, 0.11, 0.02), brass, [0, -0.36, 0]);
  },

  // ---------------------------------------------------------------- a dented chum bucket: wire bail, CHUM label, a tail sticking out
  chumBucket(b) {
    const T = tx('bucket', 64, 40, (p) => {
      p.metal(0, 0, 64, 40, PAL.steel, { b: 3 });
      for (const y of [4, 34]) { p.R(0, y, 64, 2, PAL.steel, 1.5); p.R(0, y - 1, 64, 1, PAL.steel, 5); }
      p.R(8, 12, 28, 14, PAL.red, 3); p.R(8, 12, 28, 1, PAL.red, 4.5); p.text('CHUM', 12, 16, rgb(PAL.white, 5));
      p.ellipse(48, 22, 7, 5, (nx, ny) => rgb(PAL.steel, nx + ny < 0 ? 2 : 4.5));
      p.rust(54, 34, 4, 2); p.drip(20, 28, 7, PAL.red); p.drip(30, 28, 5, PAL.red);
    });
    b.add(lathe([[0, -0.38], [0.28, -0.38], [0.3, -0.34], [0.38, 0.3], [0.4, 0.34], [0.36, 0.34], [0.3, -0.3], [0, -0.3]], 12, { side: T.r(0, 0, 64, 40) }), mat('bucket', T, { rough: 0.4, metal: 0.45 }), [0, -0.12, 0]);
    const chum = tx('chum', 32, 32, (p) => { p.stone(0, 0, 32, 32, PAL.red, { cell: 5, seed: 4, cracks: 0, b: 2.5 }); for (const [x, y] of [[8, 8], [20, 14], [12, 22]]) { p.R(x, y, 3, 2, PAL.pink, 4.5); } });
    b.add(warp(cyl(0.36, 0.08, 12, { cap: chum.r(0, 0, 32, 32) }), (v) => { if (v.y > 0) v.y += Math.sin(v.x * 12) * 0.025 + Math.cos(v.z * 10) * 0.02; }), mat('chum', chum, { rough: 0.5 }), [0, 0.17, 0]);
    // a fish tail and a rib bone poking out
    b.add(ext([[0, 0], [0.06, 0.02], [0.2, 0.18], [0.12, 0.2], [0.04, 0.08], [-0.04, 0.2], [-0.12, 0.18], [-0.06, 0.02]], 0.03, 0.01), mat('fishTail', tx('fishTail', 16, 16, (p) => { p.all(PAL.silver, 3.5); for (let x = 1; x < 16; x += 3) p.R(x, 0, 1, 16, PAL.silver, 2); }), { rough: 0.4, metal: 0.3 }), [0.1, 0.22, 0.04], [0.2, 0.3, -0.3]);
    for (const [x, a] of [[-0.12, 0.4], [-0.04, 0.2]] as V2[]) b.add(cyl(0.015, 0.3, 4), S.bone(), [x, 0.3, 0.02], [0.3, 0, a]);
    // the wire bail with a wooden grip
    b.add(tube([[-0.4, 0.18, 0], [-0.36, 0.5, 0.05], [0, 0.66, 0.08], [0.36, 0.5, 0.05], [0.4, 0.18, 0]], 0.016, { radial: 3, segs: 14 }), S.wire());
    b.add(cyl(0.045, 0.26, 7), mat('bucketGrip', tx('bucketGrip', 16, 8, (p) => p.wood(0, 0, 16, 8, PAL.oak, { knots: 0 })), { rough: 0.8 }), [0, 0.66, 0.08], [0, 0, Math.PI / 2]);
  },

  // ---------------------------------------------------------------- a junk turret: a sardine-can head, a pipe barrel, a car battery, wires
  junkTurret(b) {
    const Bt = tx('carBattery', 64, 32, (p) => { p.panel(0, 0, 64, 32, PAL.black, 2.5, { e: 2 }); p.R(6, 10, 36, 12, PAL.yellow, 4); p.text('12V', 10, 13, rgb(PAL.ink, 1)); p.text('MAX', 26, 13, rgb(PAL.red, 2.5)); p.R(46, 8, 12, 16, PAL.black, 3.5); });
    b.add(cbox(1.3, 0.6, 0.7, 0.05, { pz: Bt.r(0, 0, 64, 32), side: Bt.r(0, 0, 32, 32), py: Bt.r(0, 0, 64, 32) }), mat('carBattery', Bt, { rough: 0.6 }), [0, -0.66, 0]);
    for (const [x, c] of [[-0.42, PAL.red], [0.42, PAL.ink]] as [number, Pal][]) b.add(cyl(0.07, 0.1, 8), mat('term' + x, tx('term' + x, 8, 8, (p) => { p.all(c, 3.5); p.R(0, 0, 8, 2, c, 5); }), { rough: 0.4 }), [x, -0.32, 0.12]);
    // the pivot and the sardine-can head (key-rolled lid peeled back)
    b.add(cyl(0.08, 0.3, 7), S.iron(), [0, -0.2, 0]);
    const Cn = tx('sardine', 64, 32, (p) => { p.metal(0, 0, 64, 32, PAL.silver, { b: 3.5 }); p.R(6, 6, 52, 20, PAL.blue, 3); p.R(6, 6, 52, 1, PAL.blue, 4.5); p.text('SARDINE', 10, 9, rgb(PAL.yellow, 4.5)); for (let i = 0; i < 3; i++) p.ellipse(16 + i * 14, 20, 6, 2.5, rgb(PAL.silver, 4.5)); });
    const can = mat('sardine', Cn, { rough: 0.3, metal: 0.55 });
    b.add(cbox(0.95, 0.42, 0.62, 0.12, { pz: Cn.r(0, 0, 64, 32), nz: Cn.r(0, 0, 64, 32), side: Cn.r(0, 0, 16, 32), py: Cn.r(0, 0, 64, 32) }), can, [-0.05, 0.12, 0], [0, -0.35, 0.08]);
    b.add(cyl(0.1, 0.32, 10, { side: Cn.r(0, 0, 64, 6) }), can, [0.3, 0.42, -0.08], [0.5, 0, 1.4]);
    // the barrel: a rusty pipe with a coupling, and a scope
    const pipe = mat('rustyPipe', tx('rustyPipe', 32, 16, (p) => { p.metal(0, 0, 32, 16, PAL.iron, { b: 3 }); p.rust(8, 8, 4, 1); p.rust(24, 6, 3, 2); p.R(0, 0, 32, 2, PAL.iron, 5); }), { rough: 0.6, metal: 0.4 });
    b.add(cyl(0.09, 0.95, 8, { ch: 0.02 }), pipe, [0.6, 0.26, 0.2], [0, -0.35, Math.PI / 2 + 0.25]);
    b.add(cyl(0.13, 0.12, 8, { ch: 0.02 }), pipe, [0.3, 0.19, 0.1], [0, -0.35, Math.PI / 2 + 0.25]);
    b.add(cyl(0.11, 0.06, 8), S.dark(), [1.04, 0.37, 0.36], [0, -0.35, Math.PI / 2 + 0.25]);
    b.add(cyl(0.05, 0.36, 7), S.chrome(), [-0.16, 0.42, 0.1], [0, -0.35, Math.PI / 2]);
    b.add(cyl(0.035, 0.02, 7), mat('scopeLens', tx('scopeLens', 8, 8, (p) => { p.all(PAL.red, 4); p.R(1, 1, 2, 2, PAL.white, 5); }), { emissive: '#ff3030', ek: 1 }), [0.02, 0.42, 0.17], [0, -0.35, Math.PI / 2]);
    // wires and tape
    b.add(tube([[-0.42, -0.28, 0.12], [-0.6, -0.1, 0.25], [-0.5, 0.12, 0.32]], 0.025, { radial: 4, segs: 8 }), mat('wireRed', tx('wireRed', 8, 4, (p) => { p.all(PAL.red, 3.5); p.R(0, 0, 8, 1, PAL.red, 5); }), { rough: 0.4 }));
    b.add(tube([[0.42, -0.28, 0.12], [0.5, -0.06, 0.3], [0.2, 0.1, 0.34]], 0.025, { radial: 4, segs: 8 }), S.rubber());
    b.add(cbox(0.2, 0.46, 0.66, 0.02), mat('tape', tx('tape', 8, 8, (p) => { p.all(PAL.silver, 4); p.R(0, 0, 8, 1, PAL.silver, 5); p.R(0, 4, 8, 1, PAL.silver, 3); }), { rough: 0.5 }), [-0.36, 0.12, -0.02], [0, -0.35, 0.08]);
  },

  // ---------------------------------------------------------------- a net trap: a rolled net tied with rope, floats, weights, a spring trigger
  netTrap(b) {
    const N = tx('rolledNet', 64, 32, (p) => {
      p.all(PAL.dark, 1);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) { const a = (x + y) % 8, c = (x - y + 64) % 8; if (a < 2 || c < 2) p.t(x, y, pal('#4a8a5a'), a === 0 || c === 0 ? 4 : 3); }
    });
    b.add(cyl(0.32, 1.5, 10, { side: N.r(0, 0, 64, 32), cap: N.r(0, 0, 32, 32) }), mat('rolledNet', N, { rough: 0.9 }), [0, 0.02, 0], [0, 0.1, Math.PI / 2]);
    for (const x of [-0.5, 0.0, 0.5]) b.add(torus(0.33, 0.035, 4, 12), S.rope(), [x, 0.02, 0], [0, Math.PI / 2 + 0.1, 0]);
    const F = tx('netFloat', 32, 16, (p) => { p.all(PAL.orange, 3.5); p.R(0, 0, 32, 3, PAL.orange, 5); p.R(0, 13, 32, 3, PAL.orange, 2); });
    for (const [x, y] of [[-0.78, 0.2], [0.8, -0.1]] as V2[]) b.add(cyl(0.12, 0.2, 9, { ch: 0.03 }), mat('netFloat', F, { rough: 0.8 }), [x, y, 0.1], [0.4, 0, 1.4]);
    b.add(lathe([[0, -0.08], [0.07, -0.07], [0.08, 0], [0.07, 0.07], [0, 0.08]], 8), S.lead(), [-0.25, -0.36, 0.2], [0, 0, 1.4], [1, 1.5, 1]);
    // the trigger: a steel plate on a coil spring, a red button
    b.add(cbox(0.4, 0.04, 0.3, 0.015), S.chrome(), [0.3, 0.4, 0.06], [0.3, 0, 0]);
    b.add(tube(Array.from({ length: 13 }, (_, i) => [0.3 + Math.cos(i * 1.4) * 0.06, 0.32 + i * 0.006, 0.06 + Math.sin(i * 1.4) * 0.06] as V3), 0.012, { radial: 3, segs: 24 }), S.wire());
    b.add(cyl(0.06, 0.05, 8), mat('redBtn', tx('redBtn', 8, 8, (p) => { p.all(PAL.red, 3.5); p.R(1, 1, 3, 2, PAL.red, 5); }), { rough: 0.3, emissive: '#801010', ek: 0.5 }), [0.3, 0.45, 0.06], [0.3, 0, 0]);
  },

  // ---------------------------------------------------------------- a sea mine: horned, riveted, a red band, a chain stub
  seaMine(b) {
    const T = tx('mine', 64, 32, (p) => {
      p.metal(0, 0, 64, 32, PAL.iron, { b: 2.5, polish: false });
      p.R(0, 14, 64, 4, PAL.red, 3); p.R(0, 14, 64, 1, PAL.red, 4.5);
      for (let x = 2; x < 64; x += 6) { p.rivet(x, 9, PAL.iron); p.rivet(x, 19, PAL.iron); }
      p.rust(10, 26, 4, 1); p.rust(40, 4, 3, 2); p.drip(41, 7, 5); p.rust(52, 26, 3, 3);
      p.R(0, 0, 64, 3, PAL.iron, 4);
    });
    b.add(ball(0.38, 12, 9, T.r(0, 0, 64, 32)), mat('mine', T, { rough: 0.55, metal: 0.4 }), [0, 0, 0], [0.2, 0, 0], 1, { smooth: 0.5 });
    const horn = mat('mineHorn', tx('mineHorn', 8, 16, (p) => { p.all(PAL.brass, 3); p.R(0, 0, 8, 5, PAL.brass, 4.5); p.R(0, 12, 8, 4, PAL.iron, 2.5); }), { rough: 0.35, metal: 0.55 });
    for (let i = 0; i < 9; i++) {
      const phi = i < 1 ? 0 : i < 5 ? 0.95 : 1.9, th = (i % 4) * (TAU / 4) + (i >= 5 ? Math.PI / 4 : 0);
      if (phi > 1.8 && i % 2) continue;
      const d = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      b.add(cyl(0.05, 0.18, 6, { rTop: 0.035 }), horn, [d.x * 0.44, d.y * 0.44, d.z * 0.44], [e.x, e.y, e.z]);
      b.add(ball(0.045, 6, 4), horn, [d.x * 0.54, d.y * 0.54, d.z * 0.54]);
    }
    for (let i = 0; i < 2; i++) b.add(torus(0.06, 0.02, 4, 8), S.iron(), [0, -0.44 - i * 0.1, 0], [0, i * Math.PI / 2, 0]);
  },

  // ---------------------------------------------------------------- a harpoon ballista: an oak bow over a driftwood sled, a barbed bolt nocked
  harpoonBallista(b) {
    const Wd = tx('ballOak', 64, 12, (p) => { p.wood(0, 0, 64, 12, PAL.oak, { seed: 8, knots: 2, lines: 3 }); p.R(0, 0, 64, 1, PAL.oak, 4.5); });
    const oak = mat('ballOak', Wd, { rough: 0.75 });
    // the bow, iron-capped tips, the drawn string
    const bow: V3[] = [[-1.42, 0.22, 0], [-0.9, 0.5, 0.04], [-0.3, 0.66, 0.06], [0.3, 0.66, 0.06], [0.9, 0.5, 0.04], [1.42, 0.22, 0]];
    b.add(tube(bow, (t) => 0.085 * (1 - Math.abs(t - 0.5) * 0.9), { radial: 6, segs: 24, uv: Wd.r(0, 0, 64, 12) }), oak);
    for (const x of [-1.42, 1.42]) b.add(cone(0.06, 0.16, 5), S.iron(), [x, 0.22, 0], [0, 0, x < 0 ? 0.9 : -0.9]);
    b.add(tube([[-1.4, 0.24, 0], [0, -0.14, 0.12], [1.4, 0.24, 0]], 0.014, { radial: 3, segs: 6, tension: 0 }), S.twine());
    b.add(cbox(0.36, 0.26, 0.3, 0.04), S.iron(), [0, 0.6, 0.02]);
    // the tiller down the middle and the driftwood sled
    b.add(cbox(0.24, 1.55, 0.2, 0.04, { side: Wd.r(0, 0, 64, 12), pz: Wd.r(0, 0, 64, 12) }), oak, [0, -0.22, 0]);
    const D = tx('sled', 64, 12, (p) => { p.wood(0, 0, 64, 12, PAL.drift, { seed: 3, knots: 2 }); p.holes([[20, 5], [44, 7]], PAL.drift); });
    for (const x of [-0.32, 0.32]) b.add(cbox(0.14, 0.9, 0.12, 0.03, D.r(0, 0, 64, 12)), mat('sled', D, { rough: 0.9 }), [x, -0.55, -0.12], [0, 0, x < 0 ? -0.2 : 0.2]);
    b.add(cbox(0.86, 0.12, 0.12, 0.03, D.r(0, 0, 64, 12)), mat('sled', D), [0, -0.88, -0.12]);
    b.add(cbox(0.06, 0.24, 0.1, 0.02), S.iron(), [0, -0.42, 0.14], [0.4, 0, 0]);
    // the harpoon bolt: barbed head above the bow, fletched tail
    b.add(cyl(0.03, 1.5, 6), S.iron(), [0, 0.18, 0.15]);
    b.add(ext([[0, 0.32], [0.08, 0.1], [0.06, 0.06], [0.16, -0.08], [0.04, 0.0], [0.03, -0.04], [-0.03, -0.04], [-0.04, 0.0], [-0.16, -0.08], [-0.06, 0.06], [-0.08, 0.1]], 0.05, 0.015), S.point(), [0, 0.88, 0.15]);
    for (const a of [0, Math.PI / 2]) b.add(ext([[0, 0], [0.1, -0.06], [0.1, -0.22], [0, -0.14], [-0.1, -0.22], [-0.1, -0.06]], 0.02, 0.006), mat('fletch', tx('fletch', 8, 8, (p) => { p.all(PAL.red, 3.5); p.R(0, 0, 8, 2, PAL.white, 5); }), { rough: 0.7, side: THREE.DoubleSide }), [0, -0.46, 0.15], [0, a, 0]);
    b.add(brilliant(0.08, 6), S.amethyst(), [0, 0.6, 0.18]);
  },

  // ---------------------------------------------------------------- a clockwork heart: a brass case, a glass window onto gears, a wind-up key
  clockworkHeart(b) {
    const T = tx('cwBrass', 48, 48, (p) => {
      p.metal(0, 0, 48, 48, PAL.brass, { b: 3 });
      for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; p.rivet(23 + Math.cos(a) * 21, 23 + Math.sin(a) * 21, PAL.brass); }
      for (const [x, y] of [[8, 30], [36, 34]] as V2[]) for (let i = 0; i < 10; i++) p.t(x + i, y + Math.round(Math.sin(i) * 1.5), PAL.brass, 1.5);
      p.glint(12, 9, 2);
    });
    const brass = mat('cwBrass', T, { rough: 0.3, metal: 0.6 });
    b.add(rock(61, 0.44, [1, 1, 0.62], 18, 0.04), brass, [-0.3, 0.2, 0]);
    b.add(rock(62, 0.44, [1, 1, 0.62], 18, 0.04), brass, [0.3, 0.2, 0]);
    b.add(hull([[-0.7, 0.18, 0.18], [-0.7, 0.18, -0.16], [0.7, 0.18, 0.18], [0.7, 0.18, -0.16], [-0.5, -0.3, 0.22], [0.5, -0.3, 0.22], [-0.5, -0.3, -0.2], [0.5, -0.3, -0.2], [0, -0.86, 0.04], [0, -0.82, -0.06], [0, 0.1, 0.3], [0, 0.1, -0.26]]), brass, [0, 0, 0]);
    // the window: a copper bezel, gears behind glass
    const gear = (n: number, rr: number, rt: number): V2[] => { const out: V2[] = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, s = TAU / n; out.push([Math.cos(a) * rr, Math.sin(a) * rr], [Math.cos(a + s * 0.2) * rt, Math.sin(a + s * 0.2) * rt], [Math.cos(a + s * 0.45) * rt, Math.sin(a + s * 0.45) * rt], [Math.cos(a + s * 0.65) * rr, Math.sin(a + s * 0.65) * rr]); } return out; };
    const steel = mat('cwSteel', tx('cwSteel', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.steel, { b: 3.5 }); p.glint(4, 4, 1); }), { rough: 0.3, metal: 0.6 });
    const copper = mat('cwCopper', tx('cwCopper', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.copper, { b: 3.5 }); p.glint(4, 4, 1); }), { rough: 0.3, metal: 0.6 });
    b.add(ext(gear(10, 0.18, 0.23), 0.05, 0.012, { holes: [oval(0, 0, 0.05, 0.05, 6).reverse()] }), steel, [-0.1, 0.04, 0.3]);
    b.add(ext(gear(8, 0.12, 0.16), 0.05, 0.012), copper, [0.2, 0.14, 0.28]);
    b.add(ext(gear(7, 0.08, 0.11), 0.05, 0.012), steel, [0.12, -0.22, 0.28]);
    b.add(torus(0.38, 0.045, 4, 18), copper, [0, 0.0, 0.32]);
    b.add(cyl(0.37, 0.01, 18), mat('compassGlass', tx('compassGlass', 16, 16, (p) => { p.all(PAL.ice, 4); p.R(2, 3, 6, 2, PAL.white, 5); p.R(3, 6, 3, 1, PAL.white, 5); }), { rough: 0.05, opacity: 0.25, depthWrite: false }), [0, 0, 0.36], [Math.PI / 2, 0, 0]);
    // the key in its side and an amethyst at the top
    const key = b.sub([0.72, 0.1, 0], [0, 0, -Math.PI / 2]);
    key.add(cyl(0.035, 0.24, 6), S.brass(), [0, 0.1, 0]);
    key.add(ext([[-0.2, 0.05], [-0.06, 0.03], [0.06, 0.03], [0.2, 0.05], [0.22, 0], [0.2, -0.05], [0.06, -0.03], [-0.06, -0.03], [-0.2, -0.05], [-0.22, 0]], 0.05, 0.015), S.brass(), [0, 0.26, 0], [Math.PI / 2, 0, 0]);
    b.add(brilliant(0.09, 6), mat('purpleGem', tx('purpleGem', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.amethyst, 6)), { rough: 0.1, emissive: '#8236c0', ek: 0.8 }), [0, 0.42, 0.24], [-0.3, 0, 0]);
  },

  // ---------------------------------------------------------------- lionfish venom: a glowing vial, striped wrap, a wax seal, a skull tag
  venomVial(b) {
    b.add(lathe([[0, -0.4], [0.22, -0.38], [0.3, -0.2], [0.3, 0.02], [0.18, 0.2], [0.1, 0.26], [0.1, 0.38], [0.13, 0.42], [0, 0.42]], 12), S.glass(), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.6 });
    const V = tx('venom', 16, 16, (p) => { p.all(PAL.venom, 4); p.R(0, 0, 16, 3, PAL.venom, 5); for (const [x, y] of [[4, 8], [10, 11], [7, 5]] as V2[]) { p.R(x, y, 2, 2, PAL.white, 5); } });
    b.add(lathe([[0, -0.36], [0.2, -0.34], [0.27, -0.18], [0.27, 0.0], [0.2, 0.08], [0, 0.08]], 12, { side: V.r(0, 0, 16, 16), cap: V.r(0, 0, 16, 16) }), mat('venom', V, { rough: 0.2, emissive: '#60e030', ek: 1.0 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.6 });
    b.add(cyl(0.11, 0.16, 8, { rTop: 0.12 }), corkMat(), [0, 0.48, 0]);
    b.add(cyl(0.14, 0.08, 8, { ch: 0.02 }), mat('wax', tx('wax', 8, 8, (p) => { p.all(PAL.red, 3); p.R(1, 1, 3, 2, PAL.red, 4.5); }), { rough: 0.4 }), [0, 0.56, 0]);
    // the lionfish wrap: red and cream stripes round the neck
    const LW = tx('lionWrap', 32, 8, (p) => { for (let x = 0; x < 32; x++) p.R(x, 0, 1, 8, (x >> 2) % 2 ? PAL.red : PAL.paper, (x >> 2) % 2 ? 3 : 4.5); p.R(0, 0, 32, 1, PAL.paper, 5); });
    const lw = mat('lionWrap', LW, { rough: 0.7 });
    b.add(cyl(0.13, 0.1, 10, { side: LW.r(0, 0, 32, 8) }), lw, [0, 0.32, 0]);
    for (const a of [-0.5, 0, 0.5]) b.add(cone(0.03, 0.22, 3, { side: LW.r(0, 0, 32, 8) }), lw, [Math.sin(a) * 0.16 + 0.1, 0.3, Math.cos(a) * 0.1], [0, 0, -1.2 + a]);
    // the skull tag on a string
    const Tg = tx('skullTag', 16, 16, (p) => { p.all(PAL.paper, 4.5); p.panel(0, 0, 16, 16, PAL.paper, 4, { noFill: true }); p.skull(4, 4, '#2a1a10', '#e8d8b0'); });
    b.add(cbox(0.2, 0.2, 0.02, 0.01, { pz: Tg.r(0, 0, 16, 16), nz: Tg.r(0, 0, 16, 16) }), mat('skullTag', Tg, { rough: 0.8 }), [0.34, -0.14, 0.18], [0, -0.3, 0.2]);
    b.add(tube([[0.12, 0.3, 0.06], [0.28, 0.14, 0.16], [0.32, -0.04, 0.18]], 0.01, { radial: 3, segs: 6 }), S.twine());
  },

  // ---------------------------------------------------------------- an ink bomb: a squid-skin ball, tentacles lashed round it, a lit fuse
  inkBomb(b) {
    const T = tx('inkBomb', 32, 32, (p) => {
      p.all(pal('#3a2a5a'), 2.5);
      for (let i = 0; i < 16; i++) { const x = Math.floor(hash2(i, 1, 2) * 30), y = Math.floor(hash2(i, 2, 2) * 30); p.ellipse(x + 1, y + 1, 1.8, 1.8, rgb(PAL.purple, 3.5)); p.t(x, y, PAL.purple, 5); }
      p.R(4, 4, 6, 3, PAL.white, 5); p.R(5, 7, 3, 2, PAL.purple, 5);
    });
    b.add(ball(0.34, 12, 9), mat('inkBomb', T, { rough: 0.25, metal: 0.1 }), [0, -0.08, 0], [0, 0, 0], 1, { smooth: 1.1 });
    const Ar = tx('tentacle', 48, 8, (p) => { p.all(PAL.pink, 3); p.R(0, 0, 48, 2, PAL.pink, 4.5); for (let x = 2; x < 48; x += 4) p.ellipse(x, 6, 1.5, 1.2, rgb(PAL.white, 4.5)); });
    const arm = mat('tentacle', Ar, { rough: 0.4 });
    b.add(tube(Array.from({ length: 9 }, (_, i) => { const a = (i / 8) * Math.PI * 1.2 - 0.6; return [Math.sin(a) * 0.36, -0.08 + Math.cos(a) * 0.1 - 0.04, Math.cos(a) * 0.36] as V3; }), 0.045, { radial: 5, segs: 16, uv: Ar.r(0, 0, 48, 8) }), arm);
    b.add(tube([[0.3, -0.24, 0.16], [0.42, -0.36, 0.12], [0.36, -0.46, 0.08], [0.26, -0.42, 0.06]], (t) => 0.04 * (1 - t * 0.7), { radial: 5, segs: 8, uv: Ar.r(0, 0, 48, 8) }), arm);
    b.add(cyl(0.1, 0.1, 8, { ch: 0.02 }), S.brass(), [0.0, 0.26, 0], [0, 0, -0.2]);
    b.add(tube([[0.02, 0.3, 0], [0.06, 0.42, 0.02], [0.16, 0.48, 0.0], [0.24, 0.44, 0]], 0.022, { radial: 4, segs: 8 }), S.twine());
    const spk = mat('fuseSpark', tx('fuseSpark', 8, 8, (p) => { p.all(PAL.yellow, 5); p.R(2, 2, 3, 3, PAL.white, 5); }), { emissive: '#ff9a2a', ek: 2.2 });
    b.add(ico(0.06, 0), spk, [0.26, 0.45, 0]);
    for (const [dx, dy] of [[0.08, 0.06], [0.1, -0.03], [0.02, 0.1]] as V2[]) b.add(cone(0.012, 0.08, 3), spk, [0.26 + dx * 0.6, 0.45 + dy * 0.6, 0], [0, 0, -Math.atan2(dx, dy)]);
  },

  // ---------------------------------------------------------------- a cutpurse pouch: drawstring leather, a ruffled neck, coins spilling
  cutpursePouch(b) {
    const L = tx('pouch', 48, 40, (p) => {
      p.all(PAL.leather, 3);
      p.creases(0, 6, 48, 30, PAL.leather, 10, 2);
      for (let x = 0; x < 48; x += 8) p.R(x, 0, 1, 40, PAL.leather, 2.5);
      p.stitch(0, 30, 47, 30, '#e8c890', '#1e0c06');
      p.R(18, 14, 12, 10, PAL.leather, 2); p.stitch(18, 14, 29, 14, '#e8c890', '#1e0c06'); p.stitch(18, 23, 29, 23, '#e8c890', '#1e0c06');
      p.R(0, 0, 48, 3, PAL.leather, 4);
    });
    const leather = mat('pouch', L, { rough: 0.7 });
    b.add(lathe([[0, -0.42], [0.22, -0.4], [0.36, -0.22], [0.38, -0.02], [0.28, 0.16], [0.13, 0.24], [0.11, 0.28]], 10, { side: L.r(0, 0, 48, 40) }), leather, [0, -0.04, 0], [0.15, 0, 0], 1, { smooth: 0.7 });
    b.add(warp(lathe([[0.11, 0.24], [0.2, 0.36], [0.26, 0.44], [0.0, 0.3]], 12, { side: L.r(0, 0, 48, 8) }), (v) => { const a = Math.atan2(v.x, v.z), k = 1 + 0.18 * Math.cos(a * 6) * Math.max(0, v.y - 0.3) * 8; v.x *= k; v.z *= k; }), leather, [0, -0.04, 0], [0.15, 0, 0]);
    b.add(torus(0.12, 0.028, 4, 10), S.thread(), [0, 0.23, 0.03], [Math.PI / 2 + 0.15, 0, 0]);
    for (const sx of [1, -1]) { b.add(tube([[sx * 0.1, 0.22, 0.12], [sx * 0.2, 0.1, 0.2], [sx * 0.24, -0.06, 0.22]], 0.018, { radial: 3, segs: 6 }), S.thread()); b.add(ball(0.04, 6, 4), S.gold(), [sx * 0.24, -0.08, 0.22]); }
    // coins spilling
    const C = tx('pouchCoin', 32, 36, (p) => { p.ellipse(16, 16, 16, 16, (nx, ny) => rgb(PAL.gold, Math.hypot(nx, ny) > 0.8 ? 2.5 : nx + ny < -0.4 ? 4.5 : 3.5)); p.text('1', 15, 13, rgb(PAL.gold, 1.5)); for (let x = 0; x < 32; x++) p.R(x, 32, 1, 4, PAL.gold, x % 2 ? 2 : 3.5); });
    const cm = mat('pouchCoin', C, { rough: 0.3, metal: 0.6, emissive: '#7a4006', ek: 0.15 });
    coin(b, cm, C.r(0, 0, 32, 32), C.r(0, 32, 32, 4), { r: 0.13, h: 0.04, pos: [0.3, -0.42, 0.2], rot: [-1.2, 0.2, 0], seed: 3 });
    coin(b, cm, C.r(0, 0, 32, 32), C.r(0, 32, 32, 4), { r: 0.13, h: 0.04, pos: [0.42, -0.36, 0.0], rot: [-0.3, 0.6, 0.4], seed: 6 });
    coin(b, cm, C.r(0, 0, 32, 32), C.r(0, 32, 32, 4), { r: 0.12, h: 0.04, pos: [0.04, 0.38, 0.02], rot: [0.2, 0.3, 0.3], seed: 8 });
  },

  // ---------------------------------------------------------------- two carved bone dice, sixes up
  boneDice(b) {
    const D = tx('dice', 64, 48, (p) => {
      const pips: Record<number, V2[]> = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]] };
      for (let f = 0; f < 6; f++) {
        const x0 = (f % 4) * 16, y0 = Math.floor(f / 4) * 16;
        p.R(x0, y0, 16, 16, PAL.bone, 4); p.panel(x0, y0, 16, 16, PAL.bone, 4, { noFill: true });
        p.ln(x0 + 2, y0 + 12, x0 + 6, y0 + 13, PAL.bone, 2.5);
        for (const [i, j] of pips[f + 1]) { const x = x0 + 3 + i * 4, y = y0 + 3 + j * 4; p.R(x, y, 3, 3, PAL.ink, f === 0 ? 0 : 1); p.t(x, y + 3, PAL.bone, 5); p.t(x + 3, y + 1, PAL.bone, 5); if (f === 0) p.R(x, y, 3, 3, PAL.red, 2.5); }
      }
      p.R(32, 16, 32, 32, PAL.bone, 4);
    });
    const f = (n: number) => D.r(((n - 1) % 4) * 16, Math.floor((n - 1) / 4) * 16, 16, 16);
    const m = mat('dice', D, { rough: 0.45 });
    const die = (pos: V3, rot: V3, faces: [number, number, number, number, number, number]) => b.add(warp(cbox(0.44, 0.44, 0.44, 0.06, { pz: f(faces[0]), px: f(faces[1]), py: f(faces[2]), nx: f(faces[3]), ny: f(faces[4]), nz: f(faces[5]) }), (v) => { v.x += Math.sin(v.y * 9) * 0.008; }), m, pos, rot);
    die([-0.16, -0.12, 0.08], [0.25, -0.4, 0.08], [6, 3, 5, 4, 2, 1]);
    die([0.2, 0.16, -0.12], [0.5, 0.5, -0.3], [6, 2, 4, 5, 3, 1]);
  },
};
