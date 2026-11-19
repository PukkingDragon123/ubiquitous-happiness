// HUD / pickup props (about 1 unit tall): heart, pearl coin, key, puffer bomb, flask, empty flask.
import * as THREE from 'three';
import { B, mat, hull, cyl, cone, tube, ext, ball, lathe, oval, ico, type V2 } from './kit';
import { tx, PAL } from './paint';
import { corkMat } from './parts';
import { S } from './shared';

/** a potion flask: a round-bellied glass bottle, optionally full of glowing green */
function flask(b: B, full: boolean) {
  b.add(lathe([[0, -0.42], [0.26, -0.42], [0.36, -0.28], [0.38, -0.08], [0.3, 0.12], [0.13, 0.22], [0.11, 0.38], [0.14, 0.42], [0, 0.42]], 12), S.glass(), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.7 });
  if (full) {
    const V = tx('flaskLiquid', 16, 16, (p) => { p.all(PAL.venom, 4); p.R(0, 0, 16, 3, PAL.venom, 5); p.R(3, 6, 2, 2, PAL.white, 5); p.R(9, 10, 2, 2, PAL.white, 5); });
    b.add(lathe([[0, -0.38], [0.24, -0.37], [0.33, -0.26], [0.35, -0.08], [0.3, 0.06], [0, 0.06]], 12, { side: V.r(0, 0, 16, 16), cap: V.r(0, 0, 16, 16) }), mat('flaskLiquid', V, { rough: 0.2, emissive: '#5cb830', ek: 0.9 }), [0, 0, 0], [0, 0, 0], 1, { smooth: 0.7 });
  }
  b.add(cyl(0.12, 0.16, 8, { rTop: 0.135 }), corkMat(), [0, 0.48, 0]);
  b.add(cyl(0.125, 0.05, 8), S.thread(), [0, 0.36, 0]);
}

export const HUD_MODELS: Record<string, (b: B) => void> = {
  heart(b) {
    const T = tx('hudHeart', 32, 32, (p) => { p.all(PAL.red, 3.5); p.R(0, 0, 32, 10, PAL.red, 4.5); p.R(0, 24, 32, 8, PAL.red, 2.5); p.R(5, 4, 6, 4, PAL.white, 5); });
    const m = mat('hudHeart', T, { rough: 0.2, emissive: '#a01030', ek: 0.4 });
    b.add(ball(0.26, 10, 8), m, [-0.18, 0.1, 0], [0, 0, 0], 1, { smooth: 1.2 });
    b.add(ball(0.26, 10, 8), m, [0.18, 0.1, 0], [0, 0, 0], 1, { smooth: 1.2 });
    b.add(hull([[-0.42, 0.06, 0.14], [0.42, 0.06, 0.14], [-0.42, 0.06, -0.14], [0.42, 0.06, -0.14], [-0.3, -0.2, 0.18], [0.3, -0.2, 0.18], [-0.3, -0.2, -0.16], [0.3, -0.2, -0.16], [0, -0.5, 0.04], [0, -0.48, -0.06]]), m, [0, 0, 0], [0, 0, 0], 1, { smooth: 0.9 });
  },
  pearlCoin(b) {
    const T = tx('hudPearl', 32, 16, (p) => { p.all(PAL.pearl, 3.5); for (let x = 0; x < 32; x++) { p.t(x, 4 + Math.round(Math.sin(x * 0.4) * 1.5), PAL.pink, 4.5); p.t(x, 11, PAL.nacre, 4); } p.R(0, 13, 32, 3, PAL.pearl, 2.5); p.R(5, 2, 5, 3, PAL.white, 5); });
    b.add(ball(0.36, 14, 10), mat('hudPearl', T, { rough: 0.15, metal: 0.1, emissive: '#4a3a5a', ek: 0.35 }), [0, 0, 0], [0.3, 0.5, 0], 1, { smooth: 1.3 });
  },
  key(b) {
    const T = tx('hudKey', 32, 16, (p) => { p.metal(0, 0, 32, 16, PAL.brass, { b: 3.5 }); p.R(0, 0, 32, 2, PAL.brass, 5); p.R(0, 14, 32, 2, PAL.brass, 1.5); p.glint(5, 4, 1); });
    const m = mat('hudKey', T, { rough: 0.25, metal: 0.65 });
    b.add(ext(oval(0, 0, 0.22, 0.2, 12), 0.1, 0.03, { holes: [oval(0, 0, 0.1, 0.09, 8).reverse()], rects: T.r(0, 0, 32, 16) }), m, [0, 0.3, 0]);
    b.add(cyl(0.05, 0.62, 6, { ch: 0.01 }), m, [0, -0.15, 0]);
    b.add(ext([[0, 0], [0.18, 0], [0.18, 0.06], [0.12, 0.06], [0.12, 0.12], [0.18, 0.12], [0.18, 0.2], [0, 0.2]], 0.08, 0.02, { rects: T.r(0, 0, 32, 16) }), m, [0.0, -0.46, 0]);
    b.add(cyl(0.08, 0.06, 8, { ch: 0.015 }), m, [0, 0.08, 0]);
  },
  bomb(b) {
    const T = tx('hudPuffer', 32, 32, (p) => { for (let y = 0; y < 32; y++) p.R(0, y, 32, 1, y > 20 ? PAL.white : PAL.yellow, y > 20 ? 4.5 : y < 6 ? 4.5 : 3.5); for (const [x, y] of [[5, 8], [14, 4], [22, 10], [9, 15], [26, 16]] as V2[]) p.ellipse(x, y, 1.6, 1.6, '#7a4c06'); });
    b.add(ball(0.32, 12, 9), mat('hudPuffer', T, { rough: 0.45 }), [0, -0.05, 0], [0, 0, 0], 1, { smooth: 1.2 });
    const sp = mat('pufSpine', tx('pufSpine', 8, 16, (p) => { p.all(PAL.bone, 4.5); p.R(0, 0, 8, 5, PAL.leather, 2); p.R(1, 0, 1, 16, PAL.white, 5); }), { rough: 0.4 });
    const n = 22;
    for (let i = 0; i < n; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / n), th = i * 2.39996;
      const d = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
      if (d.y > 0.85) continue;
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d));
      b.add(cone(0.035, 0.16, 4), sp, [d.x * 0.37, d.y * 0.37 - 0.05, d.z * 0.37], [e.x, e.y, e.z]);
    }
    for (const x of [-0.13, 0.13]) b.add(ball(0.07, 7, 5, [0, 0, 1, 1]), mat('pufEye', tx('pufEye', 16, 16, (p) => { p.all(PAL.white, 5); p.ellipse(9, 9, 4, 4, '#0e0a14'); p.R(7, 6, 2, 2, PAL.white, 5); p.R(0, 0, 16, 5, PAL.yellow, 3); }), { rough: 0.2 }), [x, 0.02, 0.28], [0, 0, 0], [1, 1, 0.6]);
    b.add(cyl(0.07, 0.08, 7), S.brass(), [0.06, 0.29, 0], [0, 0, -0.3]);
    b.add(tube([[0.08, 0.32, 0], [0.12, 0.44, 0.02], [0.22, 0.5, 0], [0.3, 0.46, 0]], 0.02, { radial: 4, segs: 8 }), S.twine());
    b.add(ico(0.06, 0), mat('fuseSpark', tx('fuseSpark', 8, 8, (p) => { p.all(PAL.yellow, 5); p.R(2, 2, 3, 3, PAL.white, 5); }), { emissive: '#ff9a2a', ek: 2.2 }), [0.32, 0.47, 0]);
  },
  flask(b) { flask(b, true); },
  flaskEmpty(b) { flask(b, false); },
};
