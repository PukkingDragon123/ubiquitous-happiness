// Every texture of the map diorama, painted in code with the pixel painter (src/gfx/px.ts):
//   groundDetail()  RGBA data tile: sand grains / grass tufts / rock cracks / seabed ripples, one per channel
//   atlas()         512x512 prop page (wood, thatch, hull paints, sails, people, buoys, shells...) + emissive page
//   foliage()       alpha cut-out leaves (palm fronds, kelp blades, grass)
//   rockTex(), tableTex(), medallions()  rocks, the wooden table, the node icon plates
import * as THREE from 'three';
import { Px, ramp, pxNoise, worley, hex, mix, shade, RGB } from '../gfx/px';
import { clamp01, hash2, segDist } from '../core/math';
import type { Reg } from '../gfx/loft';
import type { NodeType } from './gen';

const CELL = 64, PAGE = 512;
/** UV region of atlas cell (cx, cy) spanning cw x ch cells, inset to avoid mip bleeding */
export function cell(cx: number, cy: number, cw = 1, ch = 1, inset = 2): Reg {
  return { x: (cx * CELL + inset) / PAGE, y: (cy * CELL + inset) / PAGE, w: (cw * CELL - inset * 2) / PAGE, h: (ch * CELL - inset * 2) / PAGE };
}
/** a sub-rectangle of a cell, in cell pixels */
export function sub(cx: number, cy: number, x: number, y: number, w: number, h: number, inset = 1): Reg {
  return { x: (cx * CELL + x + inset) / PAGE, y: (cy * CELL + y + inset) / PAGE, w: (w - inset * 2) / PAGE, h: (h - inset * 2) / PAGE };
}

export const A = {
  deck: cell(0, 0, 2, 1), post: cell(2, 0), thatch: cell(3, 0), wallDoor: cell(4, 0), wallWin: cell(5, 0), tin: cell(6, 0), brick: cell(7, 0),
  hull: [0, 1, 2, 3, 4, 5].map((i) => sub(i < 3 ? 0 : 2, 1, 0, (i % 3) * 21, 128, 21)),
  hullIn: cell(4, 1), sail: cell(5, 1), cabin: cell(6, 1), crate: cell(7, 1),
  lhouse: cell(0, 2), barrel: cell(1, 2), metal: cell(2, 2), rust: cell(3, 2), rope: cell(4, 2), brass: cell(5, 2), glass: cell(6, 2),
  black: sub(7, 2, 0, 0, 32, 32), white: sub(7, 2, 32, 0, 32, 32), red: sub(7, 2, 0, 32, 32, 32), yellow: sub(7, 2, 32, 32, 32, 32),
  skin: [0, 1, 2, 3].map((i) => sub(0, 3, (i % 2) * 32, Math.floor(i / 2) * 32, 32, 32)),
  shirt: [0, 1, 2, 3].map((i) => sub(1, 3, (i % 2) * 32, Math.floor(i / 2) * 32, 32, 32)),
  pants: [0, 1, 2, 3].map((i) => sub(2, 3, (i % 2) * 32, Math.floor(i / 2) * 32, 32, 32)),
  hat: [0, 1, 2, 3].map((i) => sub(3, 3, (i % 2) * 32, Math.floor(i / 2) * 32, 32, 32)),
  boot: sub(4, 3, 0, 0, 32, 32), rod: sub(4, 3, 32, 0, 32, 32), cork: sub(4, 3, 0, 32, 32, 32), lamp: sub(4, 3, 32, 32, 32, 32),
  pennant: [0, 1, 2, 3].map((i) => sub(5 + (i >> 1), 3, 0, (i & 1) * 32, 64, 32)),
  buoyRW: cell(0, 4), buoyYB: cell(1, 4), buoyGW: cell(2, 4), shell: cell(3, 4, 2, 1), turtle: cell(5, 4), turtleSkin: cell(6, 4), crab: cell(7, 4),
  ice: cell(0, 5), snow: cell(1, 5), bottle: cell(2, 5), parchment: cell(3, 5), banner: cell(4, 5, 2, 1), awning: cell(6, 5), net: cell(7, 5),
  bark: cell(0, 6), darkWood: cell(1, 6), chest: cell(2, 6), gold: cell(3, 6), sign: cell(4, 6), canvas: cell(5, 6), umbrella: cell(6, 6), bone: cell(7, 6),
  checker: cell(0, 7), stone: cell(1, 7), hullDark: cell(2, 7), redPaint: cell(3, 7), bluePaint: cell(4, 7), cream: cell(5, 7), moss: cell(6, 7), coral: cell(7, 7),
};

const R = (cs: string[], steps: number, d = 0.6) => ramp(cs, steps, d);

// ------------------------------------------------------------------ painting helpers
type Pnt = (x: number, y: number) => RGB | null;
function region(p: Px, rx: number, ry: number, w: number, h: number, fn: Pnt) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); if (c) p.set(rx + x, ry + y, c); }
}
function planks(p: Px, rx: number, ry: number, w: number, h: number, o: { cols: string[]; n: number; vertical?: boolean; seed: number; nails?: boolean; gap?: string; worn?: number }) {
  const r = R(o.cols, 5);
  region(p, rx, ry, w, h, (x, y) => {
    const a = o.vertical ? x : y, b = o.vertical ? y : x, L = o.vertical ? w : h;
    const bw = L / o.n, bi = Math.floor(a / bw), ba = a - bi * bw;
    const sh = hash2(bi, 3, o.seed);
    if (ba < 1) return hex(o.gap ?? '#2a1a14');
    const grain = pxNoise(b * 0.35 + sh * 40, a * 2.2 + bi * 9, 3, 2, o.seed + bi) * 0.5 + pxNoise(b, a * 4, 9, 3, o.seed + 5) * 0.5;
    let t = 0.35 + sh * 0.3 + (grain - 0.5) * 0.7;
    if (ba < 2) t -= 0.18; else if (ba > bw - 2) t += 0.1;
    if (o.worn) t += (pxNoise(x, y, 7, 3, o.seed + 9) - 0.5) * o.worn;
    let c = r(t, x, y);
    const end = Math.floor((b + sh * 37) / 37);
    if (((b + Math.floor(sh * 37)) % 37) === 0) c = shade(c, 0.6);
    if (o.nails && (ba === 3 || ba === Math.floor(bw) - 3) && ((b + end * 7 + Math.floor(sh * 11)) % 18) === 2) c = hex('#3a3634');
    return c;
  });
}
function stripes(p: Px, rx: number, ry: number, w: number, h: number, cols: string[], n: number, vertical = false, shadeK = 0.25) {
  region(p, rx, ry, w, h, (x, y) => {
    const a = vertical ? x : y, L = vertical ? w : h;
    const i = Math.floor((a / L) * n) % cols.length;
    const c = hex(cols[i]);
    const tt = ((a / L) * n) % 1;
    const k = 1 + (tt < 0.12 ? -shadeK : tt > 0.88 ? shadeK * 0.4 : 0) + (pxNoise(x, y, 6, 2, 3) - 0.5) * 0.12;
    return shade(c, k);
  });
}
function fillNoise(p: Px, rx: number, ry: number, w: number, h: number, cols: string[], sc = 6, seed = 1, steps = 5) {
  const r = R(cols, steps);
  region(p, rx, ry, w, h, (x, y) => r(pxNoise(x, y, sc, 3, seed, 0) * 0.85 + pxNoise(x, y, 2, 1, seed + 3) * 0.3 - 0.07, x, y));
}

// ------------------------------------------------------------------ ground detail (data texture)
export function groundDetail(): THREE.DataTexture {
  const S = 64;
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    // R sand: grains + soft ripples + shell bits
    const rip = Math.sin(((x * 2 + y * 3) / S) * Math.PI * 2 * 3 + pxNoise(x, y, 10, 2, 4, S) * 3) * 0.5 + 0.5;
    let sand = 0.45 + (pxNoise(x, y, 8, 3, 1, S) - 0.5) * 0.45 + rip * 0.12 + (hash2(x, y, 7) - 0.5) * 0.18;
    const sh = hash2(x, y, 99);
    if (sh > 0.985) sand = 0.98; else if (sh < 0.012) sand = 0.08;
    // G grass: tufts (worley), bright tips, dark roots
    const [f1, f2] = worley(x, y, 6, 3, S);
    let grass = clamp01(1 - f1 / 4.2) * 0.6 + (pxNoise(x, y, 5, 3, 8, S) - 0.5) * 0.5 + 0.25;
    if (f2 - f1 < 0.7) grass -= 0.1;
    grass = 0.22 + grass * 0.78;
    grass += (hash2(x, y, 31) - 0.5) * 0.15;
    // B rock: faceted plates with dark cracks
    const [r1, r2, rh] = worley(x, y, 9, 11, S);
    let rock = 0.35 + rh * 0.4 + (pxNoise(x, y, 6, 3, 13, S) - 0.5) * 0.35 - r1 * 0.015;
    if (r2 - r1 < 0.9) rock = 0.05 + hash2(x, y, 5) * 0.08;
    // A seabed: ripples + pebbles + shells
    const rip2 = Math.sin(((x * 3 - y * 2) / S) * Math.PI * 2 * 4 + pxNoise(x, y, 12, 2, 21, S) * 4) * 0.5 + 0.5;
    let bed = 0.4 + rip2 * 0.25 + (pxNoise(x, y, 7, 3, 17, S) - 0.5) * 0.35 + (hash2(x, y, 41) - 0.5) * 0.1;
    const pb = worley(x, y, 8, 23, S);
    if (pb[0] < 1.3 && pb[2] > 0.7) bed = pb[2] > 0.92 ? 0.98 : 0.1 + pb[0] * 0.12;
    d[i] = clamp01(sand) * 255; d[i + 1] = clamp01(grass) * 255; d[i + 2] = clamp01(rock) * 255; d[i + 3] = clamp01(bed) * 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ prop atlas
export function atlas(): { map: THREE.Texture; emissive: THREE.Texture } {
  const p = new Px(PAGE, PAGE);
  const e = new Px(PAGE, PAGE);
  e.fill(() => [0, 0, 0]);
  const C = (cx: number, cy: number) => [cx * CELL, cy * CELL] as const;
  let [x, y] = C(0, 0);
  planks(p, x, y, 128, 64, { cols: ['#5a3e2c', '#8a6446', '#b08a62', '#d6b488'], n: 6, seed: 1, nails: true, worn: 0.3 });
  [x, y] = C(2, 0);
  planks(p, x, y, 64, 64, { cols: ['#2e2220', '#4e3a2e', '#6a5040', '#8a6a52'], n: 2, vertical: true, seed: 2 });
  region(p, x, y + 44, 64, 20, (xx, yy) => { const k = (yy + hash2(xx, yy, 3) * 6) / 20; return k > 0.35 ? mix(hex('#2e4a2a'), hex('#5a7a3a'), hash2(xx, yy, 4)) : null; });
  [x, y] = C(3, 0); // thatch
  region(p, x, y, 64, 64, (xx, yy) => {
    const row = Math.floor(yy / 8), ry = yy % 8, off = (row % 2) * 3;
    const strand = hash2(Math.floor((xx + off) / 2), row, 9);
    const t = 0.25 + strand * 0.5 + (ry / 8) * 0.35 - (ry === 0 ? 0.3 : 0);
    return R(['#5a4020', '#8e6a32', '#c4a050', '#ead48a'], 5)(t, xx, yy);
  });
  [x, y] = C(4, 0); // wall with a door
  planks(p, x, y, 64, 64, { cols: ['#1e4a52', '#2e6a70', '#4a8e8a', '#7ab8a8'], n: 6, vertical: true, seed: 4, worn: 0.35 });
  p.rect(x + 22, y + 22, 20, 42, '#3a2618'); planks(p, x + 23, y + 23, 18, 41, { cols: ['#4a2e1c', '#6e4a2e', '#8e6440', '#a87a52'], n: 3, vertical: true, seed: 5 });
  p.rect(x + 37, y + 44, 2, 2, '#e8c45a');
  [x, y] = C(5, 0); // wall with a window
  planks(p, x, y, 64, 64, { cols: ['#1e4a52', '#2e6a70', '#4a8e8a', '#7ab8a8'], n: 6, vertical: true, seed: 6, worn: 0.35 });
  p.rect(x + 18, y + 16, 28, 24, '#4a2e1c');
  region(p, x + 20, y + 18, 24, 20, (xx, yy) => (xx === 11 || xx === 12 || yy === 9 || yy === 10 ? hex('#4a2e1c') : mix(hex('#ffcf6a'), hex('#ff9a3a'), yy / 20)));
  region(e, x + 20, y + 18, 24, 20, (xx, yy) => (xx === 11 || xx === 12 || yy === 9 || yy === 10 ? null : mix(hex('#ffc860'), hex('#ff8a30'), yy / 20)));
  p.rect(x + 16, y + 40, 32, 3, '#6e4a2e');
  [x, y] = C(6, 0); // corrugated tin
  region(p, x, y, 64, 64, (xx, yy) => {
    const w = Math.sin((xx / 4) * Math.PI) * 0.5 + 0.5;
    const rust = pxNoise(xx, yy, 7, 3, 12) + (yy / 64) * 0.3;
    const base = mix(mix(hex('#6a7480'), hex('#b4bcc4'), w), mix(hex('#6a3a20'), hex('#b0602e'), w), clamp01((rust - 0.55) * 3));
    return base;
  });
  [x, y] = C(7, 0); // stone bricks
  region(p, x, y, 64, 64, (xx, yy) => {
    const row = Math.floor(yy / 8), off = (row % 2) * 8;
    const bx = Math.floor((xx + off) / 16);
    if (yy % 8 === 0 || (xx + off) % 16 === 0) return hex('#3a3634');
    const t = 0.35 + hash2(bx, row, 3) * 0.35 + (pxNoise(xx, yy, 4, 2, 3) - 0.5) * 0.3 + ((yy % 8) === 1 ? 0.15 : 0);
    return R(['#4e4a4a', '#7a746e', '#a49c90', '#c8c0b0'], 5)(t, xx, yy);
  });
  // hull paints: [paint ramp, stripe]
  const hulls: [string[], string][] = [
    [['#7a1c1c', '#b8322a', '#e2523a', '#ff8a6a'], '#f4ecd8'], [['#16365e', '#24558e', '#3a7cc0', '#6aa8e0'], '#f4ecd8'],
    [['#a8a49a', '#d4d0c4', '#ece8de', '#ffffff'], '#2a5a8a'], [['#1e4a2e', '#2e6e3e', '#4a9a52', '#7ac872'], '#f4ecd8'],
    [['#a87a1a', '#d8a828', '#f2c84a', '#ffe88a'], '#2a3a5a'], [['#2a2a32', '#3e3e48', '#585866', '#7a7a8a'], '#d84a2a'],
  ];
  hulls.forEach(([cols, stripe], i) => {
    const ox = (i < 3 ? 0 : 2) * CELL, oy = CELL + (i % 3) * 21;
    const r = R(cols, 5);
    region(p, ox, oy, 128, 21, (xx, yy) => {
      if (yy < 3) return R(['#5a3e2c', '#8a6446', '#b08a62', '#d6b488'], 4)(0.6 - yy * 0.15 + hash2(xx, 0, 2) * 0.2, xx, yy);
      if (yy === 3) return hex('#2a1a14');
      if (yy >= 12 && yy < 14) return shade(hex(stripe), yy === 12 ? 1.1 : 0.9);
      if (yy >= 16) return R(['#3a1410', '#6a2418', '#8a3420'], 3)(0.5 + (pxNoise(xx, yy, 4, 2, 7) - 0.5), xx, yy);
      const plank = Math.floor((yy - 4) / 4);
      const t = 0.55 + (pxNoise(xx * 0.4, yy, 5, 2, 3 + i) - 0.5) * 0.4 - ((yy - 4) % 4 === 0 ? 0.15 : 0) + plank * 0.03 - (yy - 4) * 0.03;
      return r(t, xx, yy);
    });
  });
  [x, y] = C(4, 1); planks(p, x, y, 64, 64, { cols: ['#4a3020', '#6e4a30', '#946a44', '#b88a5a'], n: 8, seed: 8 });
  [x, y] = C(5, 1); // sail canvas
  region(p, x, y, 64, 64, (xx, yy) => {
    let t = 0.62 + (pxNoise(xx, yy, 9, 3, 4) - 0.5) * 0.25;
    if (yy % 16 === 0) t -= 0.2;
    if (xx > 36 && xx < 52 && yy > 30 && yy < 44) t -= 0.12;
    return R(['#8a7a62', '#c4b494', '#e8dcc0', '#fff8e8'], 5)(t, xx, yy);
  });
  [x, y] = C(6, 1); // cabin: white boards, two lit windows
  planks(p, x, y, 64, 64, { cols: ['#8e9496', '#c4c8c6', '#e6e8e2', '#ffffff'], n: 8, seed: 9 });
  for (const wx of [10, 38]) {
    p.rect(x + wx - 2, y + 18, 20, 18, '#2a3a4a');
    region(p, x + wx, y + 20, 16, 14, (xx, yy) => (xx === 8 ? hex('#2a3a4a') : mix(hex('#ffe08a'), hex('#ffb04a'), yy / 14)));
    region(e, x + wx, y + 20, 16, 14, (xx, yy) => (xx === 8 ? null : mix(hex('#ffd070'), hex('#ff9a3a'), yy / 14)));
  }
  [x, y] = C(7, 1); // crate
  planks(p, x, y, 64, 64, { cols: ['#5a3a20', '#8a6034', '#b4884a', '#d8b06a'], n: 4, seed: 10 });
  for (let i = 0; i < 64; i++) { for (const k of [0, 1, 62, 63]) { p.set(x + i, y + k, '#3a2414'); p.set(x + k, y + i, '#3a2414'); } p.set(x + i, y + i, '#6a4424'); p.set(x + i, y + Math.min(63, i + 1), '#4a2e18'); }
  [x, y] = C(0, 2); // lighthouse: red / white bands + a door strip
  region(p, x, y, 64, 64, (xx, yy) => {
    const band = Math.floor(yy / 16) % 2;
    const c = band ? hex('#c42a2a') : hex('#f4f0e6');
    const k = 1 + (pxNoise(xx, yy, 5, 2, 3) - 0.5) * 0.15 + (yy % 16 === 15 ? -0.2 : 0) + (yy % 4 === 0 ? -0.05 : 0);
    return shade(c, k);
  });
  [x, y] = C(1, 2); // barrel staves + hoops
  planks(p, x, y, 64, 64, { cols: ['#4a2e1a', '#74502e', '#9a7044', '#bc9060'], n: 6, vertical: true, seed: 11 });
  for (const hy of [8, 9, 30, 31, 32, 54, 55]) region(p, x, y + hy, 64, 1, (xx) => shade(hex('#5a5e66'), 0.9 + hash2(xx, hy, 1) * 0.3));
  [x, y] = C(2, 2); fillNoise(p, x, y, 64, 64, ['#3a3e46', '#5e646e', '#8a929c', '#c0c8d0'], 6, 3);
  [x, y] = C(3, 2); fillNoise(p, x, y, 64, 64, ['#3a1e14', '#6a3420', '#a0522a', '#d2843e'], 5, 4);
  [x, y] = C(4, 2); // rope twist
  region(p, x, y, 64, 64, (xx, yy) => { const t = ((xx + yy * 0.6) % 6) / 6; return R(['#6a5030', '#a88a58', '#d8c08a'], 4)(Math.sin(t * Math.PI), xx, yy); });
  [x, y] = C(5, 2); fillNoise(p, x, y, 64, 64, ['#6a4410', '#b88420', '#e8c04a', '#fff0a0'], 5, 6);
  [x, y] = C(6, 2); // glass / lantern (lit)
  region(p, x, y, 64, 64, (xx, yy) => (xx % 16 < 2 ? hex('#2a2a2a') : mix(hex('#fff2b0'), hex('#ffb850'), yy / 64)));
  region(e, x, y, 64, 64, (xx, yy) => (xx % 16 < 2 ? null : mix(hex('#fff0b0'), hex('#ffb040'), yy / 64)));
  [x, y] = C(7, 2);
  fillNoise(p, x, y, 32, 32, ['#141418', '#24242a', '#34343c'], 4, 2);
  fillNoise(p, x + 32, y, 32, 32, ['#c8ccd0', '#e8ecee', '#ffffff'], 4, 3);
  fillNoise(p, x, y + 32, 32, 32, ['#8a1a18', '#c42e26', '#ee5a40'], 4, 4);
  fillNoise(p, x + 32, y + 32, 32, 32, ['#c88a10', '#f0c030', '#ffe878'], 4, 5);
  // people swatches
  const quad = (cx: number, cy: number, sets: string[][], sc = 4) => sets.forEach((cs, i) => fillNoise(p, cx * CELL + (i % 2) * 32, cy * CELL + Math.floor(i / 2) * 32, 32, 32, cs, sc, 20 + i, 4));
  quad(0, 3, [['#c08a68', '#e2ae88', '#f6caa4'], ['#7a4a30', '#a06a48', '#c48a62'], ['#d8a080', '#f0bea0', '#ffd8bc'], ['#4a2e20', '#6e4630', '#8e6044']]);
  quad(1, 3, [['#8a2a22', '#c43e2e', '#e86a4a'], ['#2a4a7a', '#3e6aa8', '#6a98d0'], ['#c88a1a', '#eab030', '#ffd860'], ['#2e5a32', '#428048', '#6aaa62']]);
  quad(2, 3, [['#2a3448', '#3e4a64', '#5a6884'], ['#5a4630', '#7a6044', '#9a7c5a'], ['#2e3a2a', '#465a3a', '#627a4e'], ['#3a2e3e', '#544458', '#706076']]);
  quad(3, 3, [['#c8a050', '#e8c870', '#fff0a0'], ['#a02a22', '#d8402e', '#ff7050'], ['#2a5a6a', '#3e8090', '#6ab0b8'], ['#e8e0d0', '#f4f0e8', '#ffffff']]);
  [x, y] = C(4, 3);
  fillNoise(p, x, y, 32, 32, ['#c89a10', '#f0c020', '#ffe060'], 4, 31);
  fillNoise(p, x + 32, y, 32, 32, ['#3a2416', '#5a3a22', '#7a5434'], 3, 32);
  fillNoise(p, x, y + 32, 32, 32, ['#8a5a30', '#b8844a', '#dcae6e'], 3, 33);
  fillNoise(p, x + 32, y + 32, 32, 32, ['#ffe9a0', '#ffd060', '#ffb040'], 3, 34);
  fillNoise(e, x + 32, y + 32, 32, 32, ['#ffd880', '#ffc050', '#ffa030'], 3, 34);
  // pennants (each 64x32: a triangle reaching right)
  const pcols = [['#c42a2a', '#f4f0e6'], ['#f0c030', '#2a3a5a'], ['#2e7a4a', '#f4f0e6'], ['#3a5aa8', '#ffd860']];
  pcols.forEach(([a, b], i) => {
    const ox = (5 + (i >> 1)) * CELL, oy = 3 * CELL + (i & 1) * 32;
    region(p, ox, oy, 64, 32, (xx, yy) => {
      const t = xx / 64;
      if (Math.abs(yy - 16) > 15 * (1 - t) + 0.5) return null;
      const c = Math.floor(xx / 8) % 2 ? hex(a) : hex(b);
      return shade(i === 1 ? c : hex(a), 1 + (yy < 16 ? 0.08 : -0.08) + (pxNoise(xx, yy, 5, 2, 9) - 0.5) * 0.1);
    });
  });
  // buoy bands
  stripes(p, 0, 4 * CELL, 64, 64, ['#d02a24', '#f4f0e6'], 4);
  stripes(p, CELL, 4 * CELL, 64, 64, ['#f0c020', '#22222a'], 4);
  stripes(p, 2 * CELL, 4 * CELL, 64, 64, ['#2e8a4e', '#f4f0e6'], 4);
  [x, y] = C(3, 4); // hermit shell: spiral bands (u around, v along the cone)
  region(p, x, y, 128, 64, (xx, yy) => {
    const band = Math.sin((xx / 128) * Math.PI * 2 * 3 + yy * 0.35) * 0.5 + 0.5;
    const t = 0.35 + band * 0.4 + (pxNoise(xx, yy, 5, 2, 8) - 0.5) * 0.3 - (yy % 16 === 0 ? 0.2 : 0);
    return R(['#7a3a3a', '#c86a5a', '#f0a080', '#ffe0c4'], 5)(t, xx, yy);
  });
  [x, y] = C(5, 4); // turtle shell: hex plates
  region(p, x, y, 64, 64, (xx, yy) => {
    const [f1, f2, h] = worley(xx, yy, 14, 51);
    if (f2 - f1 < 1.6) return hex('#2a2a14');
    return R(['#3a4a1e', '#5e6e2a', '#8a8a3a', '#b8a85a'], 5)(0.3 + h * 0.4 + (1 - f1 / 12) * 0.3, xx, yy);
  });
  [x, y] = C(6, 4); fillNoise(p, x, y, 64, 64, ['#4a6a3a', '#6e8e4a', '#94b060', '#c0d080'], 3, 52);
  [x, y] = C(7, 4); fillNoise(p, x, y, 64, 64, ['#8a2010', '#c8401e', '#f0703a', '#ffa868'], 4, 53);
  [x, y] = C(0, 5); fillNoise(p, x, y, 64, 64, ['#8ac0e0', '#b8e0f4', '#e0f6ff', '#ffffff'], 8, 54);
  [x, y] = C(1, 5); fillNoise(p, x, y, 64, 64, ['#b8c8dc', '#dce8f4', '#f4f8ff', '#ffffff'], 6, 55);
  [x, y] = C(2, 5); // bottle glass
  region(p, x, y, 64, 64, (xx, yy) => R(['#1a5a4a', '#2a8a70', '#5ac0a0', '#c0fff0'], 5)(0.4 + (xx < 10 ? 0.5 : 0) + (pxNoise(xx, yy, 6, 2, 3) - 0.5) * 0.2, xx, yy));
  [x, y] = C(3, 5); fillNoise(p, x, y, 64, 64, ['#a8885a', '#d4b884', '#f0dcb0', '#fff4d8'], 7, 56);
  [x, y] = C(4, 5); // tournament banner: checkered + gold trim
  region(p, x, y, 128, 64, (xx, yy) => {
    if (yy < 4 || yy > 59) return hex(yy < 2 || yy > 61 ? '#8a5a10' : '#f0c030');
    return (Math.floor(xx / 8) + Math.floor(yy / 8)) % 2 ? hex('#1e1e26') : hex('#f4f0e6');
  });
  stripes(p, 6 * CELL, 5 * CELL, 64, 64, ['#d83a2a', '#f4ecd8'], 8, true);
  [x, y] = C(7, 5); // net
  region(p, x, y, 64, 64, (xx, yy) => ((xx + yy) % 8 === 0 || (xx - yy + 64) % 8 === 0 ? hex('#c8b88a') : hex('#3a4a4a')));
  [x, y] = C(0, 6); // palm bark rings
  region(p, x, y, 64, 64, (xx, yy) => {
    const ring = yy % 8, t = 0.3 + (ring / 8) * 0.5 + (pxNoise(xx, yy, 4, 2, 61) - 0.5) * 0.3 - (ring === 0 ? 0.3 : 0) + ((xx + yy) % 5 === 0 ? -0.08 : 0);
    return R(['#3e2c1e', '#6a4c32', '#94704a', '#b89468'], 5)(t, xx, yy);
  });
  [x, y] = C(1, 6); planks(p, x, y, 64, 64, { cols: ['#2a1c16', '#42302a', '#5a4436', '#745a46'], n: 4, seed: 62 });
  [x, y] = C(2, 6); planks(p, x, y, 64, 64, { cols: ['#4a2614', '#7a4422', '#a86432', '#d08a48'], n: 4, seed: 63 });
  for (const gx of [8, 9, 10, 53, 54, 55]) region(p, x + gx, y, 1, 64, (xx, yy) => shade(hex('#e8b830'), 0.85 + (yy % 6 === 0 ? 0.4 : 0)));
  [x, y] = C(3, 6); fillNoise(p, x, y, 64, 64, ['#a86a10', '#e0a020', '#ffd040', '#fff4a0'], 3, 64);
  fillNoise(e, x, y, 64, 64, ['#3a2400', '#6a4a10', '#a07a20'], 3, 64);
  [x, y] = C(4, 6); planks(p, x, y, 64, 64, { cols: ['#5a3a22', '#86603a', '#ac8452', '#d0a870'], n: 3, seed: 65 });
  [x, y] = C(5, 6); fillNoise(p, x, y, 64, 64, ['#6a7a4a', '#8e9e62', '#b0bc80', '#d4dca4'], 7, 66);
  stripes(p, 6 * CELL, 6 * CELL, 64, 64, ['#f04a3a', '#fff4e0', '#3aa0d8', '#fff4e0'], 8, true);
  [x, y] = C(7, 6); fillNoise(p, x, y, 64, 64, ['#a89a80', '#d4c8ac', '#f0e8d4', '#ffffff'], 5, 67);
  region(p, 0, 7 * CELL, 64, 64, (xx, yy) => ((Math.floor(xx / 8) + Math.floor(yy / 8)) % 2 ? hex('#22222a') : hex('#f4f0e6')));
  [x, y] = C(1, 7); fillNoise(p, x, y, 64, 64, ['#4a4848', '#6e6a66', '#948e86', '#bab2a6'], 5, 71);
  [x, y] = C(2, 7); planks(p, x, y, 64, 64, { cols: ['#1e1612', '#30241c', '#463428', '#5c4636'], n: 8, seed: 72 });
  [x, y] = C(3, 7); fillNoise(p, x, y, 64, 64, ['#8a1a16', '#b82a22', '#d84434', '#f06a50'], 6, 73);
  [x, y] = C(4, 7); fillNoise(p, x, y, 64, 64, ['#1a3460', '#284c88', '#3a6cb0', '#5a90d0'], 6, 74);
  [x, y] = C(5, 7); fillNoise(p, x, y, 64, 64, ['#b8a888', '#dccca8', '#f0e4c8', '#fff8e8'], 6, 75);
  [x, y] = C(6, 7); fillNoise(p, x, y, 64, 64, ['#2a3a1e', '#3e5a2a', '#5a7a38', '#7e9a4e'], 4, 76);
  [x, y] = C(7, 7); fillNoise(p, x, y, 64, 64, ['#a83a5a', '#e0607a', '#ff90a0', '#ffc8d0'], 4, 77);
  return { map: p.texture(), emissive: e.texture() };
}

// ------------------------------------------------------------------ foliage (alpha cut-outs)
export const F = {
  frond: { x: 0, y: 0, w: 1, h: 0.5 } as Reg,
  kelp: { x: 0, y: 0.5, w: 0.5, h: 0.5 } as Reg,
  grass: { x: 0.5, y: 0.5, w: 0.25, h: 0.5 } as Reg,
  leaf: { x: 0.75, y: 0.5, w: 0.25, h: 0.5 } as Reg,
};
export function foliage(): THREE.Texture {
  const p = new Px(256, 128);
  // palm frond: midrib along x, leaflets angled toward the tip, drooping width profile
  const lf = R(['#1a4a24', '#2e7034', '#4c9a3c', '#86c450', '#c4e878'], 6);
  for (let x = 2; x < 254; x += 3) {
    const t = x / 256;
    const L = 30 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.7 + 2;
    for (const side of [-1, 1]) {
      for (let k = 0; k < L; k++) {
        const xx = x + k * 0.75, yy = 32 + side * (k + 1.5);
        const lt = 0.35 + (k / L) * 0.5 + (side < 0 ? 0.08 : -0.05);
        p.set(xx, yy, lf(lt, Math.round(xx), Math.round(yy)));
        if (k > 2 && k < L - 2) p.set(xx + 1, yy, lf(lt - 0.15, Math.round(xx), Math.round(yy)));
      }
    }
  }
  for (let x = 0; x < 250; x++) { p.set(x, 32, '#b0b858'); p.set(x, 31, '#7a8a3a'); if (x < 120) p.set(x, 33, '#5a6a2a'); }
  // kelp blade with a float bulb
  const kr = R(['#3a2a0a', '#6a5014', '#9a7a22', '#c8a83a', '#e8d070'], 6);
  for (let y = 64; y < 128; y++) for (let x = 0; x < 128; x++) {
    const v = (y - 64) / 64, u = (x - 64) / 64;
    const wv = 0.55 * Math.sin(Math.min(1, v * 1.2) * Math.PI) ** 0.6 * (1 + 0.15 * Math.sin(v * 30));
    const cx = Math.sin(v * 6) * 0.08;
    if (Math.abs(u - cx) < wv) p.set(x, y, kr(0.35 + (1 - Math.abs(u - cx) / wv) * 0.4 + (Math.sin(v * 50 + u * 8) > 0.6 ? 0.12 : 0), x, y));
  }
  p.circle(64, 120, 6, '#8a6a1a'); p.circle(62, 118, 3, '#d8b850');
  // grass tuft blades
  for (let i = 0; i < 9; i++) {
    const bx = 128 + 6 + i * 6.4, lean = (i - 4) * 0.35;
    for (let k = 0; k < 56; k++) {
      const xx = bx + lean * k * 0.4 + Math.sin(k * 0.1 + i) * 1.5, yy = 127 - k;
      const w = 2.2 * (1 - k / 60);
      for (let d = -w; d <= w; d++) p.set(xx + d, yy, R(['#2a4a1a', '#4a7a2a', '#7aaa3e', '#bcd86a'], 5)(k / 56 + (d > 0 ? 0.1 : -0.1), Math.round(xx + d), yy));
    }
  }
  // round leaf (bushes / lily pads)
  p.ellipse(224, 96, 28, 28, (nx, ny, x, y) => {
    const vein = Math.abs(Math.atan2(ny, nx) * 4) % 1 < 0.08;
    return R(['#1e4a1e', '#2e6a2a', '#4a9038', '#7ab84e'], 5)(0.6 - ny * 0.3 - Math.hypot(nx, ny) * 0.25 + (vein ? 0.25 : 0), x, y);
  });
  // soft outline on the fronds only (thin grass blades would turn into dark scribbles from above)
  const fr = new Px(256, 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) { const c = p.get(x, y); if (c[3]) fr.set(x, y, [c[0], c[1], c[2]]); }
  fr.outline('#1e4a26', 255);
  p.draw(fr, 0, 0);
  const t = p.texture();
  return t;
}

export function rockTex(): THREE.Texture {
  const S = 128;
  const p = new Px(S, S);
  const r = R(['#2e2a30', '#4a4448', '#6e6660', '#968c80', '#c0b6a6'], 7);
  p.fill((x, y) => {
    const [f1, f2, h] = worley(x, y, 18, 7, S);
    let t = 0.35 + h * 0.35 + (pxNoise(x, y, 10, 4, 3, S) - 0.5) * 0.5 + (1 - f1 / 16) * 0.12;
    if (f2 - f1 < 1.4) t -= 0.35;
    const lich = pxNoise(x, y, 6, 3, 19, S);
    let c = r(t, x, y);
    if (lich > 0.68) c = mix(c, hex('#9aa860'), 0.45);
    return c;
  });
  return p.texture({ repeat: true });
}

export function tableTex(): THREE.Texture {
  const S = 256;
  const p = new Px(S, S);
  const r = R(['#1e120c', '#3a2416', '#5a3a22', '#7a5232', '#9a6c44'], 7);
  p.fill((x, y) => {
    const pl = Math.floor(x / 64), px = x % 64;
    if (px === 0) return hex('#0e0806');
    const sh = hash2(pl, 1, 5);
    const grain = pxNoise(px * 3 + sh * 99, y * 0.25, 3, 3, 7 + pl, 0) * 0.6 + pxNoise(x, y, 14, 3, 9, S) * 0.4;
    const ring = Math.sin((px + pxNoise(x, y, 20, 2, 3, S) * 30) * 0.45) * 0.5 + 0.5;
    let t = 0.3 + sh * 0.25 + (grain - 0.5) * 0.6 + ring * 0.12;
    if (px === 1) t -= 0.2; if (px === 63) t += 0.1;
    const kn = Math.hypot(px - 30 - sh * 10, ((y + pl * 70) % 256) - 128) ;
    if (kn < 6) t -= 0.3 * (1 - kn / 6);
    return r(t, x, y);
  });
  return p.texture({ repeat: true });
}

// ------------------------------------------------------------------ node medallions
export const ICON_TYPES: (NodeType | 'start')[] = ['fishing', 'elite', 'shop', 'rest', 'treasure', 'mystery', 'boss', 'start'];
const PLATE: Record<string, [string, string]> = {
  fishing: ['#1a4a7a', '#3a86c0'], elite: ['#5a1018', '#b8302e'], shop: ['#6a3a0a', '#d88a2a'], rest: ['#1a4a2a', '#3e9a56'],
  treasure: ['#3a2a10', '#9a7a2a'], mystery: ['#2e1a5a', '#7a4ac0'], boss: ['#120a12', '#5a1420'], start: ['#4a3a20', '#a88a52'],
};

/** signed-distance painter: fills pixels with sdf < 0, then lights them as rounded volumes */
function sdfPaint(p: Px, sdf: (x: number, y: number) => number, base: string | ((x: number, y: number) => RGB), light = 0.55) {
  const m: [number, number][] = [];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (sdf(x + 0.5, y + 0.5) < 0) m.push([x, y]);
  const q = new Px(p.w, p.h);
  for (const [x, y] of m) q.set(x, y, typeof base === 'string' ? base : base(x, y));
  q.lightFromHeight((x, y) => Math.min(2.5, Math.max(0, -sdf(x + 0.5, y + 0.5))), -0.6, -0.75, light, 1.2);
  p.draw(q, 0, 0);
}
const cap = (ax: number, ay: number, bx: number, by: number, r: number) => (x: number, y: number) => segDist(x, y, ax, ay, bx, by).d - r;
const circ = (cx: number, cy: number, r: number) => (x: number, y: number) => Math.hypot(x - cx, y - cy) - r;
const ell = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
const arc = (cx: number, cy: number, r: number, w: number, a0: number, a1: number) => (x: number, y: number) => {
  let a = Math.atan2(y - cy, x - cx); if (a < a0) a += Math.PI * 2;
  if (a > a1) { const e0 = [cx + Math.cos(a0) * r, cy + Math.sin(a0) * r], e1 = [cx + Math.cos(a1) * r, cy + Math.sin(a1) * r]; return Math.min(Math.hypot(x - e0[0], y - e0[1]), Math.hypot(x - e1[0], y - e1[1])) - w; }
  return Math.abs(Math.hypot(x - cx, y - cy) - r) - w;
};
const U = (...f: ((x: number, y: number) => number)[]) => (x: number, y: number) => Math.min(...f.map((g) => g(x, y)));

function glyph(p: Px, rows: string[], ox: number, oy: number, s: number, col: string) {
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') p.rect(ox + i * s, oy + j * s, s, s, col); }));
}

function iconHook(p: Px) {
  const steel = (x: number, y: number) => mix(hex('#8ea2b8'), hex('#d8e6f4'), clamp01(1 - y / 44 + (x < 24 ? 0.1 : 0)));
  sdfPaint(p, U(arc(24, 8, 3.2, 1.3, -Math.PI, Math.PI), cap(24, 11.5, 24, 30, 1.9), arc(17.5, 30, 6.5, 1.9, 0, Math.PI), cap(11, 30, 11, 21, 1.5), (x, y) => {
    // barb
    const d1 = segDist(x, y, 11, 20, 15, 25).d; return d1 - 1.2;
  }), steel, 0.7);
  // a worm wriggling on the bend
  sdfPaint(p, (x, y) => { let d = 1e9; for (let i = 0; i < 9; i++) { const a = 0.4 + i * 0.28; const cx = 17.5 + Math.cos(a) * 6.5 + Math.sin(i * 1.9) * 1.6, cy = 30 + Math.sin(a) * 6.5 + Math.cos(i * 1.7) * 1.2; d = Math.min(d, Math.hypot(x - cx, y - cy) - 2.0); } return d; }, (x, y) => mix(hex('#e86a8a'), hex('#ffb0c0'), clamp01((40 - y) / 14)), 0.6);
  p.set(26, 37, '#ffffff');
}
function iconSkull(p: Px, boss: boolean) {
  if (!boss) {
    // crossed rods behind
    for (const [a, b, c, d] of [[6, 40, 42, 6], [42, 40, 6, 6]]) sdfPaint(p, cap(a, b, c, d, 1.4), '#8a5a30', 0.4);
    for (const [cx, cy] of [[10, 36], [38, 36]]) sdfPaint(p, circ(cx, cy, 3.2), '#5a6070', 0.6);
  } else {
    for (const [a, b, c, d] of [[4, 44, 44, 4], [44, 44, 4, 4]]) sdfPaint(p, cap(a, b, c, d, 1.8), '#c8a040', 0.6);
  }
  const bone = (x: number, y: number) => mix(hex('#d8ccb0'), hex('#fff8e8'), clamp01(1 - y / 40));
  sdfPaint(p, U(ell(24, 21, 12.5, 11.5), ell(24, 30, 8.5, 6.5)), bone, 0.65);
  for (const ex of [19, 29]) p.ellipse(ex, 22, 3.6, 4, boss ? '#3a0408' : '#2a1414');
  if (boss) { p.set(19, 22, '#ff4a3a'); p.set(29, 22, '#ff4a3a'); p.set(18, 21, '#ffb0a0'); p.set(28, 21, '#ffb0a0'); }
  p.poly([[22, 29], [26, 29], [24, 26]], '#3a2a24');
  for (let x = 18; x <= 30; x++) { p.set(x, 33, (x % 2) ? '#3a2a24' : '#fff8e8'); p.set(x, 34, (x % 2) ? '#fff8e8' : '#3a2a24'); }
  if (!boss) {
    // a pro-angler cap with a hook pin
    sdfPaint(p, (x, y) => Math.max(ell(24, 15, 13.5, 8)(x, y), y - 13), (x, y) => mix(hex('#c42a2a'), hex('#ff6a4a'), clamp01(1 - (y - 6) / 8)), 0.5);
    sdfPaint(p, ell(33, 13.5, 9, 2.2), '#a01e1e', 0.4);
    p.rect(21, 8, 2, 4, '#e8e8f0'); p.set(23, 11, '#e8e8f0');
  } else {
    // crown
    p.poly([[11, 13], [14, 3], [19, 10], [24, 1], [29, 10], [34, 3], [37, 13]], (x, y) => mix(hex('#ffe060'), hex('#d89a10'), y / 14));
    p.rect(11, 12, 27, 3, '#c88a10');
    for (const gx of [14, 24, 34]) p.circle(gx, 5 + (gx === 24 ? -2 : 0), 1.5, '#ff3a5a');
  }
}
function iconShell(p: Px) {
  const sh = (x: number, y: number) => {
    const a = Math.atan2(y - 20, x - 27), r = Math.hypot(x - 27, y - 20);
    const band = Math.sin(a * 2 + r * 0.9) > 0.55;
    return mix(hex(band ? '#d06a5a' : '#f6b494'), hex('#fff0dc'), clamp01(1 - y / 34) * 0.5);
  };
  sdfPaint(p, U(ell(27, 21, 14, 12), ell(36, 11, 6, 6), ell(41, 6, 3, 3)), sh, 0.75);
  // spiral groove
  for (let t = 0; t < 14; t += 0.05) { const r = 1.2 + t * 0.85, a = t * 1.2; p.set(32 + Math.cos(a) * r * 0.9, 15 + Math.sin(a) * r * 0.75, '#8a3a34'); }
  // the crab peeking out: eye stalks, claw, legs
  sdfPaint(p, ell(15, 31, 8, 6), '#e8502a', 0.6);
  for (const [sx, sy, ex, ey] of [[11, 27, 8, 18], [16, 26, 15, 17]]) { sdfPaint(p, cap(sx, sy, ex, ey, 0.9), '#e8502a', 0.4); p.circle(ex, ey, 2.4, '#1a0a0a'); p.set(ex - 1, ey - 1, '#ffffff'); }
  sdfPaint(p, U(ell(8, 37, 5.5, 4), cap(12, 33, 8, 37, 2)), '#ff6a3a', 0.6);
  p.rect(3, 36, 4, 1, '#3a0a04');
  for (let i = 0; i < 3; i++) sdfPaint(p, cap(17 + i * 3, 36, 19 + i * 4, 43, 0.9), '#c83a1a', 0.3);
}
function iconTurtle(p: Px) {
  const skin = '#8ab04a';
  for (const [ax, ay, bx, by] of [[14, 14, 6, 8], [34, 14, 42, 8], [15, 34, 8, 40], [33, 34, 40, 40]]) sdfPaint(p, cap(ax, ay, bx, by, 3.4), skin, 0.5);
  sdfPaint(p, U(circ(24, 7, 4.8), cap(24, 40, 24, 44, 1.6)), skin, 0.55);
  p.set(22, 6, '#101010'); p.set(26, 6, '#101010');
  const shell = (x: number, y: number) => {
    const [f1, f2, h] = worley(x * 1.4, y * 1.2, 9, 5);
    if (f2 - f1 < 1.3) return hex('#2a3010');
    return mix(hex('#4e6a22'), hex('#a8a040'), clamp01(0.3 + h * 0.4 + (1 - y / 40) * 0.3));
  };
  sdfPaint(p, ell(24, 24, 12, 14), shell, 0.75);
  // spa steam curls
  for (const sx of [37, 41]) for (let k = 0; k < 10; k++) p.set(sx + Math.sin(k * 0.9) * 1.5, 30 - k * 1.6 - (sx - 37), '#f0fbff');
}
function iconChest(p: Px) {
  const wood = (x: number, y: number) => mix(hex('#7a4222'), hex('#c07a3a'), clamp01(1 - (y % 6) / 6 * 0.5 - y / 60));
  sdfPaint(p, (x, y) => Math.max(Math.abs(x - 24) - 15, Math.abs(y - 30) - 9), wood, 0.4);
  sdfPaint(p, (x, y) => Math.max(ell(24, 21, 15, 9)(x, y), y - 21), (x, y) => mix(hex('#8a4a26'), hex('#d8904a'), clamp01(1 - (y - 12) / 9)), 0.6);
  for (const gx of [12, 36]) sdfPaint(p, (x, y) => Math.max(Math.abs(x - gx) - 1.6, Math.max(y - 39, 12.5 - y + (Math.abs(x - 24) > 13 ? 3 : 0))), '#f0c030', 0.6);
  sdfPaint(p, (x, y) => Math.max(Math.abs(x - 24) - 15.5, Math.abs(y - 21.5) - 1.2), '#e0b030', 0.4);
  sdfPaint(p, (x, y) => Math.max(Math.abs(x - 24) - 3.2, Math.abs(y - 25) - 4), '#ffd84a', 0.7);
  p.rect(23, 25, 2, 3, '#3a2400');
  // glints of gold under the lid
  for (const [gx, gy] of [[17, 19], [30, 18], [24, 17]]) { p.set(gx, gy, '#fff8c0'); p.set(gx + 1, gy, '#ffe060'); }
  for (const [sx, sy] of [[40, 8], [7, 14]]) { p.set(sx, sy, '#ffffff'); p.set(sx - 1, sy, '#fff0a0'); p.set(sx + 1, sy, '#fff0a0'); p.set(sx, sy - 1, '#fff0a0'); p.set(sx, sy + 1, '#fff0a0'); }
}
function iconBottle(p: Px) {
  const glass = (x: number, y: number) => mix(hex('#2a8a74'), hex('#9ff0d8'), clamp01((30 - x + 40 - y) / 50));
  sdfPaint(p, U(cap(15, 33, 29, 19, 8), cap(29, 19, 36, 12, 3.6)), glass, 0.8);
  sdfPaint(p, cap(36, 12, 40, 8, 3.4), '#a8743a', 0.5);
  // the scroll inside
  sdfPaint(p, cap(13, 31, 25, 21, 3.4), '#f0e0b0', 0.4);
  glyph(p, [' ### ', '#   #', '   # ', '  #  ', '  #  ', '     ', '  #  '], 15, 17, 2, '#5a2a8a');
  p.set(14, 26, '#ffffff'); p.set(13, 27, '#ffffff'); p.set(31, 15, '#ffffff');
}
function iconDock(p: Px) {
  // a little anchor
  const iron = (x: number, y: number) => mix(hex('#5a6270'), hex('#c8d0dc'), clamp01(1 - y / 44));
  sdfPaint(p, U(arc(24, 8, 3.4, 1.3, -Math.PI, Math.PI), cap(24, 12, 24, 38, 2), cap(16, 17, 32, 17, 1.6), arc(24, 26, 13, 1.9, 0.25, Math.PI - 0.25)), iron, 0.65);
  for (const s of [-1, 1]) p.poly([[24 + s * 13, 30], [24 + s * 16, 27], [24 + s * 11, 26]], '#c8d0dc');
}

/** the node plates: one 64x64 cell per icon type in a 512x64 strip */
export function medallions(): { tex: THREE.Texture; uv: (t: NodeType | 'start') => Reg } {
  const p = new Px(512, 64);
  ICON_TYPES.forEach((t, i) => {
    const ox = i * 64;
    const [dark, light] = PLATE[t];
    const pr = R([dark, light], 4);
    const rim = t === 'boss' || t === 'treasure' ? ['#5a3a0a', '#a8781a', '#f0c84a', '#fff4b0'] : ['#3a2414', '#6e4a2a', '#a07444', '#d0a46a'];
    const rr = R(rim, 5);
    p.ellipse(ox + 32, 32, 31.5, 31.5, (nx, ny, x, y) => {
      const d = Math.hypot(nx, ny);
      if (d > 0.86) { const k = clamp01(0.5 - (nx + ny) * 0.35 + (d > 0.97 ? -0.3 : 0) + (d < 0.89 ? -0.25 : 0)); return rr(k, x, y); }
      return pr(clamp01(0.8 - d * 0.5 - ny * 0.25 + (pxNoise(x, y, 4, 2, 7) - 0.5) * 0.15), x, y);
    });
    // rivets on the rim
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.39; p.set(ox + 32 + Math.cos(a) * 29, 32 + Math.sin(a) * 29, '#fff4c8'); }
    const ic = new Px(48, 48);
    if (t === 'fishing') iconHook(ic); else if (t === 'elite') iconSkull(ic, false); else if (t === 'boss') iconSkull(ic, true);
    else if (t === 'shop') iconShell(ic); else if (t === 'rest') iconTurtle(ic); else if (t === 'treasure') iconChest(ic); else if (t === 'mystery') iconBottle(ic); else iconDock(ic);
    ic.outline('#140c0a', 255, false);
    // drop shadow onto the plate
    const shadow = new Px(48, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (ic.alpha(x, y)) shadow.set(x, y, shade(hex(dark), 0.5), 200);
    p.draw(shadow, ox + 9, 10);
    p.draw(ic, ox + 8, 8);
  });
  const tex = p.texture();
  return { tex, uv: (t) => { const i = ICON_TYPES.indexOf(t); return { x: (i * 64) / 512, y: 0, w: 64 / 512, h: 1 }; } };
}
