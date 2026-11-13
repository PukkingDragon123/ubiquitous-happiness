// Species specs for the lofted bony fish (and the marine reptile / mammals, which share the builder).
// Profiles are fractions of total length L, t runs nose (0) -> caudal peduncle (1). Paint functions get the
// 3D surface point for every texel of the body wrap (see PaintCtx) and return the base colour; the builder
// adds scales, lateral line, gill cover, eye socket, mouth and sheen on top.
import type { FishSpec, PaintCtx } from './builder';
import { C, mix, shade, hash2, smoothstep, noise2 } from './builder';
import type { RGB } from '../gfx/px';
import { grad, dmix, paintSwatch } from './page';
import { worley } from '../gfx/px';
import { norm, sub, add, scale, cross } from '../gfx/loft';


// ------------------------------------------------------------------------------------------- piranha
// Red-bellied piranha: deep, slab-sided disc; blunt convex forehead; jutting lower jaw (underbite) packed with
// triangular teeth; olive-grey back, glittering silver flanks, orange-red throat/belly/anal fin; tail with a
// dark base band and black margin; small adipose fin.
const piranha: FishSpec = {
  name: 'piranha', L: 0.42, body: 0.82,
  top: [[0, 0.0], [0.015, 0.035], [0.05, 0.085], [0.12, 0.14], [0.22, 0.185], [0.36, 0.21], [0.48, 0.205], [0.62, 0.16], [0.78, 0.095], [0.92, 0.06], [1, 0.056]],
  bot: [[0, 0.0], [0.015, 0.03], [0.05, 0.06], [0.12, 0.115], [0.24, 0.175], [0.4, 0.205], [0.55, 0.19], [0.7, 0.13], [0.84, 0.08], [0.94, 0.058], [1, 0.054]],
  wid: [[0, 0.0], [0.02, 0.03], [0.08, 0.058], [0.2, 0.078], [0.38, 0.082], [0.6, 0.06], [0.8, 0.035], [1, 0.02]],
  cy: [[0, -0.04], [0.1, -0.022], [0.3, 0], [1, 0.006]],
  sq: [[0, 2.0], [0.4, 2.15], [1, 2.4]],
  mouth: { t: 0.085, th: [[0, 0.44], [0.085, 0.47]], open: 0.8, lip: 0.05, lipCol: '#a0685a', interior: '#5a0e18', crease: '#20100e', idle: 0.1,
    teeth: { upper: 6, lower: 7, size: 0.024, style: 'tri', inset: 0.92, lowerSize: 0.03, t0: 0.01 } },
  eye: { t: 0.135, y: 0.4, r: 0.042, bulge: 0.68, fwd: 0.3, up: 0.1, lid: 'angry', lidCol: '#4e5646', lidLine: '#141210', lidTilt: 0.55, lidLevel: 0.3,
    paint: { iris: ['#5a0c08', '#b4200e', '#f04a1c', '#ff8a3a'], pupil: 0.5, ring: '#ffc070', sclera: '#c8c0a8', irisR: 0.9 } },
  gill: { t: 0.225, col: '#3a3632', curve: 0.03, hi: '#e0e4dc', k: 0.6 },
  lateral: { y: 0.16, col: '#e8ece4', arch: 0.012, t0: 0.24 },
  scales: { w: 6, h: 4, k: 1, rim: 0.13, hi: 0.06 },
  sheen: 0.45, rough: 0.34,
  paint: (c) => {
    // olive-grey back -> glittering silver flank -> pale belly (soft, many-step ramp)
    const yb = c.yn;
    let col = grad(['#3e4a38', '#5c6852', '#87917a', '#aab0a0', '#c6c8bc', '#d6d6cc', '#e4e2d8'])(0.42 - yb * 0.58, c.px, c.py);
    // orange-red throat + belly, rising toward the head and fading out before the tail
    const redTop = -0.32 - c.t * 0.3;
    const red = smoothstep(redTop + 0.2, redTop - 0.25, yb) * (1 - smoothstep(0.72, 0.9, c.t));
    if (red > 0) col = dmix(col, grad(['#f99a5c', '#ee6c36', '#d84c26', '#b8361e'])(Math.min(1, -yb * 0.7), c.px, c.py), red * 0.95, c.px, c.py);
    // glitter: bright pixel on scale caps (sparser toward the back)
    if (c.sid < 0.2 && c.sd < 0.32 && yb > -0.55 && yb < 0.7) col = shade(col, 1.3);
    // faint dark spots scattered on the upper flank
    if (yb > 0.0 && yb < 0.75 && c.sid > 0.92 && c.sd < 0.6 && c.t > 0.22) col = shade(col, 0.78);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.43, t1: 0.6, h: [[0, 0.1], [0.25, 0.115], [1, 0.03]], sweep: 0.55, col: ['#6c7064', '#565a50', '#3e403a'], rays: 11, rayCol: '#34362e', alpha: [0.88, 0.58], ripple: 0.3, px: [64, 40] },
    { type: 'dorsal', t0: 0.79, t1: 0.86, h: [[0, 0.034], [0.5, 0.03], [1, 0.012]], sweep: 0.8, col: ['#7a7e72', '#5c5e56'], rays: 0, alpha: [1, 0.95], opaque: true, px: [24, 16] },
    { type: 'anal', t0: 0.58, t1: 0.88, h: [[0, 0.095], [0.2, 0.085], [1, 0.03]], sweep: 0.5, col: ['#f2622c', '#d8461e', '#b02c14'], rayCol: '#8a1c0c', edge: '#1c0e0c', edgeW: 0.14, rays: 13, alpha: [0.95, 0.75], ripple: 0.3, px: [96, 36] },
    { type: 'caudal', shape: 'emarginate', len: 0.18, span: 0.15, col: ['#7c8074', '#a4a89c', '#b4b8ac', '#9a9e92'], rayCol: '#4a4c44', base: '#2c2826', baseW: 0.2, edge: '#16120e', edgeW: 0.12, rays: 18, alpha: [0.92, 0.6], px: [80, 64] },
    { type: 'pectoral', t: 0.24, y: -0.55, len: 0.095, angle: 22, col: ['#f2a070', '#ec7a48', '#d85a30'], rays: 10, rayCol: '#c04a22', alpha: [0.75, 0.42], flutter: 0.06, out: 0.7 },
    { type: 'pelvic', t: 0.42, len: 0.07, angle: 62, col: ['#f26a3a', '#d84a22'], rays: 6, alpha: [0.9, 0.6], flutter: 0.03 },
  ],
  swim: { k: 0.85, a0: 0.035, pow: 2.3, amp: 0.11, freq: 1.4, freqK: 1.1, flutter: [7, 0.02], ripple: 0.012 },
  clearcoat: 0.55,
};

// ------------------------------------------------------------------------------------------- cichlids
// Green terror: oval, deep, compressed; thick lips; long spiny dorsal whose soft rear lobe trails past the
// tail base; rounded tail. Teal-green body spangled with turquoise scale flecks, wavy turquoise lines on the
// cheeks, a dark mid-flank blotch; dorsal + caudal edged orange.
const cichlidBody = {
  L: 0.3, body: 0.79,
  top: [[0, 0.0], [0.02, 0.04], [0.06, 0.085], [0.12, 0.13], [0.2, 0.17], [0.3, 0.19], [0.45, 0.195], [0.6, 0.175], [0.76, 0.12], [0.9, 0.08], [1, 0.072]] as [number, number][],
  bot: [[0, 0.0], [0.02, 0.03], [0.06, 0.058], [0.14, 0.105], [0.25, 0.145], [0.4, 0.16], [0.55, 0.15], [0.72, 0.105], [0.87, 0.075], [1, 0.066]] as [number, number][],
  wid: [[0, 0.0], [0.03, 0.03], [0.1, 0.055], [0.25, 0.07], [0.45, 0.066], [0.7, 0.045], [1, 0.022]] as [number, number][],
  cy: [[0, -0.02], [0.15, -0.006], [0.4, 0], [1, 0.004]] as [number, number][],
  sq: [[0, 2.0], [0.5, 2.2], [1, 2.4]] as [number, number][],
};
const cichlid: FishSpec = {
  name: 'cichlid', ...cichlidBody,
  mouth: { t: 0.06, th: 0.5, open: 0.5, lip: 0.16, lipCol: '#5aa890', interior: '#4a1820', crease: '#1a2a24' },
  eye: { t: 0.125, y: 0.36, r: 0.046, fwd: 0.25, up: 0.1, lid: 'none',
    paint: { iris: ['#4a0a0a', '#b02a12', '#f06a20', '#ffb050'], pupil: 0.5, ring: '#ffd890', sclera: '#a8b8a0', irisR: 0.88, fleck: '#ffe0a0' } },
  gill: { t: 0.22, col: '#1a3a34', curve: 0.03, hi: '#8af0e0', k: 0.55 },
  lateral: { y: 0.45, col: '#a0f0e8', t0: 0.25, t1: 0.62 },
  scales: { w: 7, h: 4, k: 1.1, rim: 0.16, hi: 0.08 },
  sheen: 0.3, rough: 0.38,
  paint: (c) => {
    let col = grad(['#183a34', '#245246', '#2e6a58', '#3a8068', '#5a9a80', '#8ab8a0', '#b8d0c0'])(0.45 - c.yn * 0.55, c.px, c.py);
    // turquoise spangle on most scale centres (pearly flecks), denser on the flank
    if (c.t > 0.2 && c.sd < 0.42 && c.sid < 0.7 && c.yn > -0.7) col = mix(col, C(c.sid < 0.25 ? '#8ff8f0' : '#3ad0d0'), 0.75);
    // wavy cheek lines
    if (c.t < 0.22 && c.yn < 0.6 && c.yn > -0.7) {
      const w = Math.sin(c.yl * 260 + Math.sin(c.X * 300) * 1.4);
      if (w > 0.82) col = C('#7ef0f0');
    }
    // dark mid-flank blotch
    const bl = Math.hypot((c.t - 0.47) * 3.2, c.yn * 1.4);
    if (bl < 0.36) col = dmix(col, C('#0c1a18'), 1 - bl / 0.36 * 0.5, c.px, c.py);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.18, t1: 0.86, h: [[0, 0.04], [0.15, 0.07], [0.6, 0.075], [0.85, 0.12], [1, 0.06]], sweep: 0.35, lean: [[0, 0], [0.8, 0.3], [1, 1.1]], col: ['#2a5a50', '#2e6a5a', '#3a8070', '#e8803a'], edge: '#f09040', edgeW: 0.16, spines: 11, rays: 10, notch: 0.25, spineCol: '#9ad0c0', rayCol: '#1a3a32', spots: '#7af0e8', spotK: 0.1, alpha: [0.92, 0.72], ripple: 0.3, px: [128, 40] },
    { type: 'anal', t0: 0.6, t1: 0.88, h: [[0, 0.05], [0.6, 0.09], [1, 0.05]], sweep: 0.5, lean: [[0, 0], [1, 0.9]], col: ['#2a5a50', '#2e6a5a', '#3a7a6a'], spines: 3, rays: 8, notch: 0.2, spineCol: '#9ad0c0', spots: '#7af0e8', spotK: 0.12, edge: '#5ae0e0', edgeW: 0.1, alpha: [0.92, 0.7], ripple: 0.3, px: [64, 32] },
    { type: 'caudal', shape: 'round', len: 0.2, span: 0.12, col: ['#2a5a50', '#2e6a5a', '#3a7a6a', '#e8803a'], edge: '#f09040', edgeW: 0.1, rays: 14, rayCol: '#1a3a32', spots: '#7af0e8', spotK: 0.14, alpha: [0.92, 0.7], px: [72, 56] },
    { type: 'pectoral', t: 0.25, y: -0.35, len: 0.1, angle: 15, col: ['#a8d8c8', '#88c0b0'], rays: 9, alpha: [0.55, 0.3], flutter: 0.07, out: 0.7 },
    { type: 'pelvic', t: 0.3, len: 0.11, angle: 50, shape: 'pointed', col: ['#2e6a5a', '#3a8070'], edge: '#7af0f0', edgeW: 0.15, rays: 5, alpha: [0.9, 0.7], flutter: 0.03 },
  ],
  swim: { k: 0.8, a0: 0.03, pow: 2.4, amp: 0.09, freq: 1.2, freqK: 1.0, flutter: [6, 0.022], ripple: 0.014 },
};
// Electric blue: same build, vivid cobalt with darker vertical bars and white-blue fin edges
const cichlidBlue: FishSpec = {
  ...cichlid, name: 'cichlid_blue',
  mouth: { ...cichlid.mouth!, lipCol: '#3a6ad8', crease: '#0a1430' },
  eye: { ...cichlid.eye, paint: { iris: ['#101830', '#2a3a70', '#6a7aa8', '#c0c8e0'], pupil: 0.5, ring: '#e0e8ff', sclera: '#a0b0d8', irisR: 0.88 } },
  gill: { t: 0.22, col: '#0a1a50', curve: 0.03, hi: '#a0d8ff', k: 0.55 },
  lateral: { y: 0.45, col: '#c0e8ff', t0: 0.25, t1: 0.62 },
  paint: (c) => {
    let col = grad(['#0c1e5a', '#14308a', '#1c48b8', '#2a62e0', '#3c7cf0', '#6a9cf8', '#a8c4ff'])(0.42 - c.yn * 0.55, c.px, c.py);
    // 8 soft darker vertical bars
    const bar = Math.sin((c.t * 8.5 + 0.2) * Math.PI);
    if (c.t > 0.18 && c.t < 0.92 && bar > 0.55 && c.yn > -0.6) col = dmix(col, shade(col, 0.68), (bar - 0.55) / 0.45, c.px, c.py);
    if (c.t > 0.2 && c.sd < 0.38 && c.sid < 0.45) col = mix(col, C('#b8e0ff'), 0.4);
    if (c.t < 0.2 && c.yn > -0.2 && c.yn < 0.7) col = shade(col, 0.85);
    return col;
  },
  fins: [
    { ...cichlid.fins[0], col: ['#14308a', '#1c48b8', '#2a5ad0', '#c8e0ff'], edge: '#e8f4ff', spineCol: '#90b8ff', rayCol: '#0c2060', spots: undefined },
    { ...cichlid.fins[1], col: ['#14308a', '#1c48b8', '#2a5ad0'], edge: '#e8f4ff', spineCol: '#90b8ff', spots: '#ffd040', spotK: 0.05 },
    { ...cichlid.fins[2], col: ['#14308a', '#1c48b8', '#2a5ad0', '#c8e0ff'], edge: '#e8f4ff', rayCol: '#0c2060', spots: undefined },
    { ...cichlid.fins[3], col: ['#a8c8ff', '#80a8f0'] },
    { ...cichlid.fins[4], col: ['#1c48b8', '#2a5ad0'], edge: '#ffffff' },
  ],
};

// ------------------------------------------------------------------------------------------- peacock bass
// Elongate, big-mouthed predator (lower jaw juts); golden-yellow flanks with three black vertical bars, olive
// back, orange throat; red eye; deep notch between the spiny and soft dorsal; tail with a gold-ringed ocellus.
const peacockBass: FishSpec = {
  name: 'peacock_bass', L: 0.6, body: 0.82,
  top: [[0, 0.0], [0.02, 0.028], [0.08, 0.058], [0.18, 0.092], [0.3, 0.112], [0.45, 0.118], [0.6, 0.108], [0.76, 0.082], [0.9, 0.064], [1, 0.06]],
  bot: [[0, 0.0], [0.02, 0.034], [0.08, 0.064], [0.18, 0.088], [0.35, 0.104], [0.5, 0.104], [0.66, 0.088], [0.82, 0.066], [1, 0.056]],
  wid: [[0, 0.0], [0.03, 0.03], [0.1, 0.05], [0.25, 0.064], [0.45, 0.062], [0.7, 0.045], [1, 0.024]],
  cy: [[0, -0.014], [0.2, 0], [1, 0.004]],
  sq: [[0, 2.0], [0.5, 2.1], [1, 2.3]],
  mouth: { t: 0.115, th: [[0, 0.5], [0.115, 0.52]], open: 0.75, lip: 0.05, lipCol: '#c8b880', interior: '#6a2028', crease: '#2a2010', idle: 0.04,
    teeth: { upper: 8, lower: 9, size: 0.006, style: 'needle', inset: 0.8 } },
  eye: { t: 0.12, y: 0.42, r: 0.034, fwd: 0.2, up: 0.1, lid: 'angry', lidCol: '#5a6a30', lidLine: '#1a1a08', lidTilt: 0.35, lidLevel: 0.42,
    paint: { iris: ['#4a0606', '#a8140c', '#e83018', '#ff7a40'], pupil: 0.5, ring: '#ffd060', sclera: '#d0c890', irisR: 0.88 } },
  gill: { t: 0.24, col: '#3a3010', curve: 0.04, hi: '#fff0a0', k: 0.5 },
  lateral: { y: 0.3, col: '#fff4c0', t0: 0.25, t1: 0.96, arch: 0.004 },
  scales: { w: 5, h: 3, k: 0.9, rim: 0.12, hi: 0.05 },
  sheen: 0.35, rough: 0.38,
  paint: (c) => {
    let col = grad(['#3c4a18', '#5a6a22', '#8a9a30', '#c8b838', '#e8c840', '#f0d860', '#f4ecc0'])(0.42 - c.yn * 0.6, c.px, c.py);
    // orange-red throat and chest
    const thr = smoothstep(-0.35, -0.75, c.yn) * (1 - smoothstep(0.3, 0.5, c.t));
    if (thr > 0) col = dmix(col, C('#f07a30'), thr * 0.85, c.px, c.py);
    // three black bars (irregular edges), fading toward the belly
    for (const bt of [0.36, 0.53, 0.71]) {
      const w = 0.045 + 0.012 * noise2(c.yl * 60, bt * 10, 3);
      const d = Math.abs(c.t - bt - c.yn * 0.01);
      if (d < w && c.yn > -0.62 + noise2(c.t * 40, 1, 2) * 0.15) col = dmix(col, C('#0e0e08'), Math.min(1, (w - d) / 0.012) * (c.yn < -0.3 ? 0.6 : 0.95), c.px, c.py);
    }
    // dark blotch behind the eye
    if (c.t > 0.14 && c.t < 0.2 && Math.abs(c.yn - 0.35) < 0.18) col = dmix(col, C('#1a1a0a'), 0.6, c.px, c.py);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.31, t1: 0.52, h: [[0, 0.04], [0.25, 0.088], [0.6, 0.07], [1, 0.022]], sweep: 0.35, col: ['#7a8038', '#8a8a40', '#a09850'], spines: 8, rays: 0, notch: 0.3, spineCol: '#3a3a18', alpha: [0.85, 0.55], ripple: 0.25, px: [64, 32] },
    { type: 'dorsal', t0: 0.54, t1: 0.8, h: [[0, 0.05], [0.35, 0.09], [0.75, 0.075], [1, 0.03]], sweep: 0.45, lean: [[0, 0], [1, 0.4]], col: ['#7a8038', '#8a8a40', '#a09850'], rays: 11, rayCol: '#4a5018', spots: '#f0e8b0', spotK: 0.1, alpha: [0.88, 0.6], ripple: 0.3, px: [64, 32] },
    { type: 'anal', t0: 0.68, t1: 0.86, h: [[0, 0.05], [0.4, 0.065], [1, 0.03]], sweep: 0.4, col: ['#e86a28', '#d8501c', '#c04014'], rays: 10, rayCol: '#902a0c', alpha: [0.92, 0.7], ripple: 0.3, px: [56, 28] },
    { type: 'caudal', shape: 'truncate', len: 0.16, span: 0.1, col: ['#7a8030', '#a09038', '#d06a28', '#e85a20'], rays: 14, rayCol: '#4a4a18', alpha: [0.92, 0.72], px: [72, 56],
      over: (u, v) => { const d = Math.hypot((u - 0.5) * 1.1, (v - 0.22) * 1.5); return d < 0.12 ? C('#0a0a06') : d < 0.17 ? C('#ffd040') : null; } },
    { type: 'pectoral', t: 0.25, y: -0.4, len: 0.08, angle: 15, col: ['#e8d8a0', '#d8c080'], rays: 9, alpha: [0.6, 0.3], flutter: 0.06, out: 0.7 },
    { type: 'pelvic', t: 0.3, len: 0.08, angle: 55, col: ['#f07a30', '#e05a20'], rays: 6, alpha: [0.92, 0.7], flutter: 0.03 },
  ],
  swim: { k: 0.85, a0: 0.03, pow: 2.4, amp: 0.1, freq: 1.2, freqK: 1.1, flutter: [6, 0.018], ripple: 0.01 },
};

// ------------------------------------------------------------------------------------------- napoleon wrasse
// Humphead wrasse: big, hump-headed, thick fleshy lips; blue-green with a dark vertical dash on every scale,
// wavy yellow-green lines and two black stripes behind the eye; broad rounded tail and fins with pale rims.
const napoleon: FishSpec = {
  name: 'napoleon', L: 1.4, body: 0.82, page: [512, 512],
  top: [[0, 0.0], [0.02, 0.035], [0.05, 0.065], [0.09, 0.11], [0.14, 0.158], [0.2, 0.182], [0.27, 0.18], [0.4, 0.172], [0.56, 0.155], [0.72, 0.112], [0.87, 0.078], [1, 0.07]],
  bot: [[0, 0.0], [0.02, 0.032], [0.06, 0.06], [0.14, 0.1], [0.28, 0.135], [0.44, 0.142], [0.6, 0.128], [0.76, 0.092], [0.9, 0.068], [1, 0.062]],
  wid: [[0, 0.0], [0.03, 0.03], [0.1, 0.06], [0.25, 0.075], [0.45, 0.072], [0.7, 0.05], [1, 0.024]],
  cy: [[0, -0.01], [0.2, 0], [1, 0.004]],
  sq: [[0, 2.0], [0.5, 2.2], [1, 2.4]],
  mouth: { t: 0.06, th: 0.52, open: 0.45, lip: 0.24, lipCol: '#c8d870', interior: '#5a2030', crease: '#1a3020' },
  eye: { t: 0.11, y: 0.42, r: 0.026, fwd: 0.25, up: 0.08, lid: 'sleepy', lidCol: '#3a8a70', lidLine: '#0a2018', lidLevel: 0.45, lidTilt: 0.1,
    paint: { iris: ['#2a2a10', '#8a7020', '#e0c040', '#fff090'], pupil: 0.5, ring: '#ffe8a0', sclera: '#b8d0a0', irisR: 0.86 } },
  gill: { t: 0.24, col: '#14403a', curve: 0.03, hi: '#a0f0c0', k: 0.4 },
  scales: { w: 12, h: 8, k: 1.2, rim: 0.18, hi: 0.06, bump: 0.7 },
  sheen: 0.25, rough: 0.4,
  paint: (c) => {
    let col = grad(['#1a4a50', '#226068', '#2a7a7a', '#3a9088', '#58a898', '#7ab8a0', '#a8c8a8'])(0.42 - c.yn * 0.55, c.px, c.py);
    // dark vertical dash on each scale
    if (c.t > 0.22 && c.sd < 0.75 && Math.abs((c.px % 12) - 6) < 1.2 && c.sd > 0.15) col = shade(col, 0.66);
    // head: wavy yellow-green lines + two black stripes behind the eye
    if (c.t < 0.24) {
      const w = Math.sin(c.yl * 120 + Math.sin(c.X * 30) * 1.6 + c.t * 20);
      if (w > 0.75) col = mix(col, C('#c8e070'), 0.75);
      const ex = c.X - (0.7 - 0.11 * 0.82 * 1.4), ey = c.yl;
      if (Math.abs(ey - 0.06 - ex * 0.15) < 0.008 && ex < -0.01 && ex > -0.12) col = C('#0a1418');
      if (Math.abs(ey - 0.035 + ex * 0.18) < 0.007 && ex < -0.01 && ex > -0.1) col = C('#0a1418');
    }
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.26, t1: 0.82, h: [[0, 0.03], [0.4, 0.06], [0.8, 0.095], [1, 0.06]], sweep: 0.3, lean: [[0, 0], [1, 0.8]], col: ['#226a6a', '#2a7a70', '#3a8a70', '#c8e070'], edge: '#e0f090', edgeW: 0.08, spines: 9, rays: 10, notch: 0.12, spineCol: '#5ab0a0', rayCol: '#14403a', alpha: [0.95, 0.8], ripple: 0.25, px: [220, 48] },
    { type: 'anal', t0: 0.62, t1: 0.85, h: [[0, 0.04], [0.7, 0.08], [1, 0.05]], sweep: 0.45, lean: [[0, 0], [1, 0.8]], col: ['#226a6a', '#2a7a70', '#3a8a70'], edge: '#e0f090', edgeW: 0.1, spines: 3, rays: 8, rayCol: '#14403a', spineCol: '#5ab0a0', alpha: [0.95, 0.8], ripple: 0.25, px: [100, 40] },
    { type: 'caudal', shape: 'round', len: 0.19, span: 0.12, col: ['#2a7a70', '#3a8a78', '#4a9a80'], edge: '#e8f0a0', edgeW: 0.07, rays: 14, rayCol: '#14403a', alpha: [0.95, 0.8], px: [100, 80],
      over: (u, v, c, i, j) => (Math.sin(v * 30 + Math.sin(u * 20) * 1.5) > 0.85 ? C('#9ad8a0') : null) },
    { type: 'pectoral', t: 0.26, y: -0.3, len: 0.11, angle: 10, col: ['#3a9a88', '#c8e070'], rays: 12, rayCol: '#2a7a6a', alpha: [0.8, 0.5], flutter: 0.08, out: 0.6, px: [64, 40] },
    { type: 'pelvic', t: 0.32, len: 0.07, angle: 55, col: ['#2a7a70', '#3a8a78'], edge: '#c8e070', rays: 6, alpha: [0.9, 0.7], flutter: 0.03 },
  ],
  swim: { k: 0.75, a0: 0.03, pow: 2.5, amp: 0.07, freq: 0.7, freqK: 0.8, flutter: [3.5, 0.025], ripple: 0.008 },
};

// ------------------------------------------------------------------------------------------- picasso triggerfish
// Diamond-shaped, eyes set high and far back on a long snout, tiny mouth with yellow lips; sandy back, white
// belly; blue-and-black bands across the face and a black wedge on the rear flank crossed by pale stripes;
// swims by rippling its long soft dorsal and anal fins; the "trigger" spine up front.
const triggerfish: FishSpec = {
  name: 'triggerfish', L: 0.28, body: 0.82,
  top: [[0, 0.0], [0.02, 0.022], [0.1, 0.06], [0.2, 0.105], [0.3, 0.15], [0.4, 0.19], [0.5, 0.2], [0.6, 0.17], [0.74, 0.105], [0.88, 0.06], [1, 0.05]],
  bot: [[0, 0.0], [0.02, 0.022], [0.1, 0.055], [0.2, 0.095], [0.32, 0.145], [0.45, 0.19], [0.56, 0.192], [0.68, 0.14], [0.82, 0.08], [1, 0.048]],
  wid: [[0, 0.0], [0.03, 0.022], [0.15, 0.045], [0.35, 0.062], [0.55, 0.06], [0.75, 0.04], [1, 0.018]],
  cy: [[0, 0.012], [0.3, 0.004], [1, 0.006]],
  sq: [[0, 2.0], [0.4, 2.3], [1, 2.6]],
  mouth: { t: 0.03, th: 0.5, open: 0.4, lip: 0.18, lipCol: '#f8c830', interior: '#5a1820', crease: '#3a2a10' },
  eye: { t: 0.29, y: 0.5, r: 0.04, fwd: 0.15, up: 0.15, lid: 'none', bulge: 0.7,
    paint: { iris: ['#3a2a10', '#8a6a20', '#e0b040', '#ffe080'], pupil: 0.52, ring: '#ffe8b0', sclera: '#d8d0b0', irisR: 0.86 } },
  gill: { t: 0.34, col: '#4a3a28', curve: 0.02, k: 0.0 },
  scales: { w: 8, h: 5, k: 0.7, rim: 0.1, hi: 0.04, bump: 0.8 },
  rough: 0.45, sheen: 0.2,
  paint: (c) => {
    const x = c.t, y = c.yn;
    // tan upper body -> white lower body (soft dithered divide)
    let col = grad(['#6a5a40', '#8a7656', '#b09a7a', '#cdbb9c', '#e6dccb', '#f6f3ec', '#ffffff'])(0.32 - y * 0.75, c.px, c.py);
    const BLUE = C('#3c9ae8'), NAVY = C('#14204a'), BLACK = C('#121216'), YEL = C('#f4b020');
    // eye band: black core with blue edges, running from above the eye down to the pectoral base
    const eb = (x - 0.29) + (y - 0.5) * 0.09;
    if (y > -0.45 && y < 0.95) { const a = Math.abs(eb); if (a < 0.016) col = BLACK; else if (a < 0.026) col = BLUE; }
    // blue + navy bands over the forehead in front of the eye
    for (const k of [0.235, 0.205]) { const a = Math.abs((x - k) + (y - 0.55) * 0.12); if (y > 0.25 && y < 0.95 && a < 0.008) col = k === 0.235 ? NAVY : BLUE; }
    // yellow-orange line from the mouth corner to the pectoral base, a blue line above it
    const ly = -0.05 - x * 0.45;
    if (x < 0.34 && x > 0.015) { const a = y - ly; if (Math.abs(a) < 0.045) col = YEL; else if (a > 0.045 && a < 0.08) col = BLUE; }
    // dark wedge on the lower flank, crossed at the back by pale oblique stripes
    const topW = 0.12 - (x - 0.4) * 0.7, botW = -0.62 + (x - 0.4) * 0.6;
    if (x > 0.4 && x < 0.84 && y < topW && y > botW) {
      col = dmix(BLACK, C('#3a2e22'), 0.35 - (y - botW) * 0.2, c.px, c.py);
      const st = (((x * 15 - y * 2.2) % 1) + 1) % 1;
      if (x > 0.56 && st < 0.24) col = C('#f2eee0');
    }
    // dark saddle beneath the soft dorsal, peduncle chevrons
    if (y > 0.5 && x > 0.44 && x < 0.66) col = shade(col, 0.82);
    if (x > 0.86 && Math.abs(y) < 0.5 && (c.px % 6) < 2) col = BLACK;
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.34, t1: 0.42, h: [[0, 0.1], [0.4, 0.06], [1, 0.035]], sweep: 0.4, col: ['#3a3020', '#2a2418'], spines: 3, rays: 0, notch: 0.4, spineCol: '#2a2418', alpha: [0.95, 0.8], px: [24, 32] },
    { type: 'dorsal', t0: 0.6, t1: 0.88, h: [[0, 0.11], [0.3, 0.1], [1, 0.035]], sweep: 0.3, col: ['#d0d8e0', '#b8c4d0', '#a8b4c0'], rays: 14, rayCol: '#90a0b0', edge: '#2a3040', edgeW: 0.08, alpha: [0.6, 0.35], ripple: 1.0, px: [80, 32] },
    { type: 'anal', t0: 0.6, t1: 0.88, h: [[0, 0.1], [0.3, 0.095], [1, 0.035]], sweep: 0.3, col: ['#d0d8e0', '#b8c4d0', '#a8b4c0'], rays: 14, rayCol: '#90a0b0', edge: '#2a3040', edgeW: 0.08, alpha: [0.6, 0.35], ripple: 1.0, px: [80, 32] },
    { type: 'caudal', shape: 'truncate', len: 0.15, span: 0.09, col: ['#c8c0b0', '#b0a898', '#9a9080'], rays: 12, rayCol: '#6a6050', edge: '#3a3428', edgeW: 0.1, alpha: [0.8, 0.55], px: [56, 48] },
    { type: 'pectoral', t: 0.37, y: -0.05, len: 0.07, angle: 5, col: ['#e8e4dc', '#d0ccc0'], rays: 9, alpha: [0.5, 0.25], flutter: 0.1, out: 0.6 },
  ],
  swim: { k: 0.5, a0: 0.02, pow: 3, amp: 0.035, freq: 1.0, freqK: 0.5, flutter: [8, 0.03], ripple: 0.03 },
};

// ------------------------------------------------------------------------------------------- sardine
// Slender, silver; blue-green back with a crisp line to the bright flank, a row of dark spots, forked tail.
const sardine: FishSpec = {
  name: 'sardine', L: 0.24, body: 0.81, seg: 24, rings: 38,
  top: [[0, 0.0], [0.02, 0.02], [0.08, 0.045], [0.2, 0.068], [0.35, 0.08], [0.5, 0.08], [0.7, 0.06], [0.88, 0.038], [1, 0.034]],
  bot: [[0, 0.0], [0.02, 0.02], [0.08, 0.046], [0.25, 0.074], [0.45, 0.084], [0.62, 0.074], [0.8, 0.046], [1, 0.03]],
  wid: [[0, 0.0], [0.03, 0.022], [0.15, 0.045], [0.35, 0.055], [0.6, 0.045], [0.85, 0.025], [1, 0.016]],
  cy: [[0, 0.004], [1, 0.002]],
  mouth: { t: 0.05, th: [[0, 0.42], [0.05, 0.46]], open: 0.6, interior: '#3a2a3a', crease: '#2a3a48' },
  eye: { t: 0.11, y: 0.18, r: 0.052, fwd: 0.1, up: 0.05, lid: 'none', bulge: 0.55,
    paint: { iris: ['#3a4a5a', '#8a9aa8', '#d0dce8', '#ffffff'], pupil: 0.56, ring: '#e8f0ff', sclera: '#c0ccd8', irisR: 0.9 } },
  gill: { t: 0.2, col: '#5a7a90', curve: 0.03, hi: '#ffffff', k: 0.45 },
  scales: { w: 8, h: 5, k: 1.2, rim: 0.14, hi: 0.1 },
  sheen: 0.8, rough: 0.22,
  paint: (c) => {
    const y = c.yn;
    let col: RGB;
    if (y > 0.32) col = grad(['#0e2a48', '#164068', '#22587e', '#2e6a8a'])(1 - (y - 0.32) / 0.68, c.px, c.py);
    else col = grad(['#7a98b0', '#b4c8d6', '#dce6ee', '#eef2f6', '#ffffff'])(0.32 - y * 0.68 + 0.05, c.px, c.py);
    // iridescent band right under the back (pink -> cyan)
    if (y > 0.18 && y < 0.34) col = mix(col, C(c.t < 0.5 ? '#c8a8d8' : '#a8e0e8'), 0.35);
    // row of dark spots on the upper flank
    for (let k = 0; k < 6; k++) { const d = Math.hypot((c.t - 0.26 - k * 0.075) * 5, (y - 0.24) * 3.2); if (d < 0.12) col = C('#1a2a40'); }
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.4, t1: 0.53, h: [[0, 0.075], [1, 0.02]], sweep: 0.5, col: ['#6a8aa0', '#90a8b8'], rays: 9, alpha: [0.75, 0.4], px: [36, 24] },
    { type: 'anal', t0: 0.76, t1: 0.88, h: [[0, 0.03], [1, 0.015]], sweep: 0.5, col: ['#c8d4dc', '#e0e8ee'], rays: 7, alpha: [0.6, 0.3], px: [32, 16] },
    { type: 'caudal', shape: 'fork', len: 0.19, span: 0.11, col: ['#5a7890', '#7a98b0', '#a0b8c8'], rays: 12, rayCol: '#2a4a68', edge: '#2a4060', edgeW: 0.12, alpha: [0.85, 0.55], px: [48, 40] },
    { type: 'pectoral', t: 0.21, y: -0.45, len: 0.08, angle: 25, col: ['#d8e4ec', '#c0d0dc'], rays: 8, alpha: [0.55, 0.3], flutter: 0.06 },
    { type: 'pelvic', t: 0.45, len: 0.05, angle: 50, col: ['#e0e8ee', '#d0dce4'], rays: 5, alpha: [0.6, 0.3], flutter: 0.03 },
  ],
  swim: { k: 0.95, a0: 0.04, pow: 2.2, amp: 0.13, freq: 2.2, freqK: 1.4, flutter: [9, 0.02] },
  clearcoat: 0.8, clearcoatRough: 0.18,
};

// ------------------------------------------------------------------------------------------- barracuda
// Long torpedo with a pointed head, jutting lower jaw full of fangs, two widely spaced dorsals, big forked
// tail; steel-blue back, silver flanks, dark chevron bars above and scattered black spots behind.
const barracuda: FishSpec = {
  name: 'barracuda', L: 1.25, body: 0.84, rings: 56, page: [512, 256], bodyH: 128,
  top: [[0, 0.0], [0.02, 0.011], [0.06, 0.026], [0.12, 0.042], [0.22, 0.056], [0.4, 0.062], [0.6, 0.058], [0.8, 0.044], [0.95, 0.03], [1, 0.028]],
  bot: [[0, 0.0], [0.015, 0.014], [0.06, 0.03], [0.15, 0.046], [0.3, 0.056], [0.5, 0.058], [0.7, 0.048], [0.9, 0.031], [1, 0.027]],
  wid: [[0, 0.0], [0.03, 0.014], [0.12, 0.032], [0.3, 0.044], [0.55, 0.042], [0.8, 0.03], [1, 0.016]],
  cy: [[0, -0.008], [0.15, 0], [1, 0.002]],
  mouth: { t: 0.105, th: [[0, 0.46], [0.105, 0.5]], open: 0.6, interior: '#5a1a24', crease: '#1a2028', idle: 0.06,
    teeth: { upper: 9, lower: 10, size: 0.011, style: 'fang', inset: 0.9, t0: 0.012 } },
  eye: { t: 0.115, y: 0.32, r: 0.02, fwd: 0.25, up: 0.08, lid: 'angry', lidCol: '#4a5a6a', lidLine: '#10141a', lidTilt: 0.6, lidLevel: 0.3,
    paint: { iris: ['#3a3a20', '#a09030', '#e8d060', '#fff4b0'], pupil: 0.48, ring: '#fff8d0', sclera: '#c8ccc0', irisR: 0.88 } },
  gill: { t: 0.2, col: '#3a4a58', curve: 0.02, hi: '#ffffff', k: 0.5 },
  lateral: { y: 0.06, col: '#f0f4f8', t0: 0.2, t1: 0.98 },
  scales: { w: 5, h: 3, k: 0.8, rim: 0.1, hi: 0.06 },
  sheen: 0.7, rough: 0.26,
  paint: (c) => {
    let col = grad(['#1e2c3e', '#2c4058', '#46607a', '#8aa0b4', '#c8d4dc', '#e4eaee', '#f4f6f8'])(0.38 - c.yn * 0.6, c.px, c.py);
    // ~20 dark chevron bars on the upper flank
    if (c.t > 0.2 && c.t < 0.95 && c.yn > 0.0) {
      const ph = c.t * 22 + Math.abs(c.yn - 0.45) * 1.6;
      if ((ph % 1) < 0.32) col = dmix(col, C('#1a2634'), 0.7 * smoothstep(0.0, 0.25, c.yn), c.px, c.py);
    }
    // black spots on the rear lower flank
    if (c.t > 0.55 && c.yn < 0.0 && c.yn > -0.6 && c.sid < 0.06 && c.sd < 0.6) col = C('#141a20');
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.36, t1: 0.44, h: [[0, 0.055], [1, 0.02]], sweep: 0.6, col: ['#3a4a5a', '#2a3a4a'], spines: 5, rays: 0, notch: 0.2, spineCol: '#5a6a7a', alpha: [0.92, 0.7], px: [32, 28] },
    { type: 'dorsal', t0: 0.7, t1: 0.77, h: [[0, 0.05], [1, 0.02]], sweep: 0.5, col: ['#3a4a5a', '#2a3a4a'], rays: 8, alpha: [0.9, 0.65], px: [32, 24] },
    { type: 'anal', t0: 0.72, t1: 0.79, h: [[0, 0.045], [1, 0.018]], sweep: 0.5, col: ['#8a9aa8', '#6a7a88'], rays: 8, alpha: [0.85, 0.55], px: [32, 24] },
    { type: 'caudal', shape: 'fork', len: 0.17, span: 0.11, col: ['#2a3a4a', '#3a4c5c', '#4a5a6a'], rays: 16, rayCol: '#1a2430', edge: '#e8eef2', edgeW: 0.06, alpha: [0.95, 0.75], px: [80, 64],
      ext: (u) => { const w = Math.abs(2 * u - 1); return 0.4 + 0.6 * Math.pow(w, 1.1); } },
    { type: 'pectoral', t: 0.2, y: -0.3, len: 0.06, angle: 20, col: ['#a8b4c0', '#8a98a8'], rays: 9, alpha: [0.65, 0.35], flutter: 0.05 },
    { type: 'pelvic', t: 0.42, len: 0.045, angle: 50, col: ['#c8d0d8', '#a8b4c0'], rays: 6, alpha: [0.75, 0.45], flutter: 0.03 },
  ],
  swim: { k: 0.9, a0: 0.02, pow: 2.6, amp: 0.08, freq: 1.0, freqK: 1.2, flutter: [6, 0.015] },
  clearcoat: 0.7, clearcoatRough: 0.2,
};

// ------------------------------------------------------------------------------------------- cleaner wrasse
// Bluestreak cleaner: slender, pointed snout; a black stripe from snout through the eye widening to the tail,
// pale yellow-white above fading to electric blue toward the rear.
const cleaner: FishSpec = {
  name: 'cleaner_wrasse', L: 0.2, body: 0.85, seg: 24, rings: 38,
  top: [[0, 0.0], [0.02, 0.02], [0.08, 0.042], [0.2, 0.065], [0.4, 0.075], [0.6, 0.07], [0.8, 0.052], [1, 0.042]],
  bot: [[0, 0.0], [0.02, 0.018], [0.08, 0.038], [0.25, 0.062], [0.45, 0.07], [0.65, 0.062], [0.85, 0.046], [1, 0.04]],
  wid: [[0, 0.0], [0.03, 0.02], [0.15, 0.04], [0.4, 0.048], [0.7, 0.036], [1, 0.02]],
  mouth: { t: 0.04, th: 0.5, open: 0.4, lip: 0.08, lipCol: '#20202a', crease: '#101018' },
  eye: { t: 0.1, y: 0.15, r: 0.048, fwd: 0.15, up: 0.05, lid: 'none', bulge: 0.68,
    paint: { iris: ['#101420', '#3a4a7a', '#6a8ad0', '#c0d8ff'], pupil: 0.58, ring: '#e0f0ff', sclera: '#e8f0f8', irisR: 0.86 } },
  scales: { w: 6, h: 4, k: 0.5, rim: 0.08 },
  sheen: 0.5, rough: 0.3,
  paint: (c) => {
    const y = c.yn;
    let col = grad(['#fff2c0', '#f4f0e0', '#e8f0f8', '#ffffff'])(0.5 - y * 0.5, c.px, c.py);
    // blue toward the tail
    col = dmix(col, C(y > 0 ? '#3a8af0' : '#7ab8ff'), smoothstep(0.35, 0.85, c.t) * 0.9, c.px, c.py);
    // black stripe widening toward the tail
    const w = 0.08 + c.t * 0.32;
    if (Math.abs(y - 0.12 + c.t * 0.1) < w) col = C(c.t < 0.12 ? '#14141c' : '#0c0c14');
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.28, t1: 0.86, h: [[0, 0.03], [1, 0.04]], sweep: 0.3, col: ['#3a6ac8', '#5a8ae8'], edge: '#0c0c18', edgeW: 0.25, rays: 14, alpha: [0.85, 0.6], ripple: 0.4, px: [64, 20] },
    { type: 'anal', t0: 0.62, t1: 0.86, h: [[0, 0.025], [1, 0.035]], sweep: 0.3, col: ['#7ab0f0', '#9ac0f8'], edge: '#0c0c18', edgeW: 0.25, rays: 9, alpha: [0.8, 0.5], ripple: 0.4, px: [40, 16] },
    { type: 'caudal', shape: 'truncate', len: 0.14, span: 0.07, col: ['#0c0c18', '#2a5ad0', '#4a8af0'], rays: 10, alpha: [0.92, 0.7], px: [40, 32],
      over: (u, v) => (Math.abs(u - 0.5) < 0.16 + v * 0.1 && v < 0.9 ? C('#0c0c14') : null) },
    { type: 'pectoral', t: 0.22, y: -0.1, len: 0.07, angle: 10, col: ['#e0f0ff', '#c0d8f0'], rays: 7, alpha: [0.45, 0.25], flutter: 0.12, out: 0.7 },
  ],
  swim: { k: 0.8, a0: 0.04, pow: 2.2, amp: 0.08, freq: 1.8, freqK: 1.0, flutter: [10, 0.03], ripple: 0.012 },
};

// ------------------------------------------------------------------------------------------- pufferfish
// Round-bodied puffer: big friendly eyes, beak, tiny fins fluttering like propellers; ochre back with dark
// brown spots, white belly. Inflates into a spiky ball (morph target + spines that erupt from the skin).
const PUFF_C: [number, number, number] = [0.034, -0.004, 0];
const pufferfish: FishSpec = {
  name: 'pufferfish', L: 0.36, body: 0.86, seg: 32, rings: 44,
  top: [[0, 0.0], [0.02, 0.06], [0.08, 0.135], [0.18, 0.19], [0.32, 0.21], [0.5, 0.185], [0.68, 0.115], [0.84, 0.058], [1, 0.042]],
  bot: [[0, 0.0], [0.02, 0.065], [0.1, 0.155], [0.24, 0.205], [0.42, 0.2], [0.6, 0.135], [0.8, 0.06], [1, 0.038]],
  wid: [[0, 0.0], [0.03, 0.075], [0.12, 0.155], [0.3, 0.19], [0.5, 0.17], [0.7, 0.1], [0.88, 0.048], [1, 0.03]],
  cy: [[0, -0.01], [0.3, 0], [1, 0.01]],
  mouth: { t: 0.035, th: 0.55, open: 0.45, lip: 0.1, lipCol: '#e8d8b0', interior: '#4a1a20', crease: '#3a2a18',
    teeth: { upper: 1, lower: 1, size: 0.016, style: 'beak', inset: 0.55, t0: 0.012, t1: 0.012, col: ['#fff8e8', '#f0e4c8', '#d8c8a0', '#b0a080'] } },
  eye: { t: 0.2, y: 0.42, r: 0.066, fwd: 0.2, up: 0.12, lid: 'sad', lidCol: '#a08a50', lidLine: '#3a2a10', lidTilt: -0.25, lidLevel: 0.55, bulge: 0.68,
    paint: { iris: ['#1a3a2a', '#2a7a5a', '#58c090', '#b0f0c8'], pupil: 0.58, ring: '#f0ffd0', sclera: '#f0f0e0', irisR: 0.84 } },
  scales: { w: 7, h: 6, k: 0.35, rim: 0.06, hi: 0.03, bump: 0.8, tMin: 0.05 },
  sheen: 0.25, rough: 0.4,
  morph: { centre: [PUFF_C[0] * 1, PUFF_C[1], 0], R: 0.27, k: 0.9 },
  paint: (c) => {
    let col = grad(['#5a4a1c', '#7a6424', '#a08638', '#c0a650', '#d8c890', '#f0ead8', '#fbf8f0'])(0.4 - c.yn * 0.62, c.px, c.py);
    // dark brown spots on the back and flanks (rounded, larger toward the back)
    if (c.yn > -0.25) {
      const sx = c.X * 120, sy = c.Y * 120 + (c.Z > 0 ? 0 : 50);
      const n = noise2(sx * 0.9, sy * 0.9, 5);
      if (n > 0.66) col = dmix(col, C('#3a2a10'), Math.min(1, (n - 0.66) * 12), c.px, c.py);
    }
    // faint belly lines
    if (c.yn < -0.35 && ((c.py + Math.round(c.t * 30)) % 7) === 0) col = shade(col, 0.92);
    // white ring round the eye
    if (c.eyeD > 0.03 && c.eyeD < 0.034) col = C('#f8f0d8');
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.68, t1: 0.78, h: [[0, 0.07], [0.5, 0.075], [1, 0.03]], sweep: 0.4, col: ['#c0a650', '#a08638', '#8a7030'], rays: 8, alpha: [0.85, 0.55], flutter: 0, ripple: 0.8, px: [32, 28] },
    { type: 'anal', t0: 0.7, t1: 0.8, h: [[0, 0.06], [0.5, 0.065], [1, 0.03]], sweep: 0.4, col: ['#e8dcc0', '#d8c8a0'], rays: 8, alpha: [0.8, 0.5], ripple: 0.8, px: [32, 24] },
    { type: 'caudal', shape: 'round', len: 0.15, span: 0.08, col: ['#a08638', '#b89a48', '#8a7030'], rays: 11, rayCol: '#5a4a1c', alpha: [0.92, 0.7], edge: '#5a4818', edgeW: 0.08, px: [48, 40] },
    { type: 'pectoral', t: 0.32, y: 0.0, len: 0.07, baseLen: 0.05, angle: -5, col: ['#e0cc90', '#c8b070'], rays: 9, alpha: [0.6, 0.35], flutter: 0.22, out: 0.5 },
  ],
  extras: (b) => {
    // spines that erupt when inflated: collapsed inside the skin at rest, morph offsets push them out
    const rect = b.pg.alloc(6, 10);
    paintSwatch(b.pg, rect, ['#fff4d8', '#e0c890', '#a08040', '#6a5020'], 0.4);
    const L = b.L, sl = 0.05 * L;
    for (let i = 0; i < 9; i++) for (let j = 0; j < 14; j++) {
      const t = 0.08 + i * 0.085 + (j % 2) * 0.04;
      if (t > 0.78) continue;
      const a = ((j + 0.5) / 14) * Math.PI * 2 + (i % 2) * 0.2;
      const p = b.surf(t, a);
      const inner: [number, number, number] = [p[0] * 0.98 + PUFF_C[0] * 0.02, p[1] * 0.97, p[2] * 0.97];
      const { from, tip } = b.cone(inner, [0, 1, 0], 1e-4, 1e-4, rect, 4);
      const ip = b.inflate(p), dir = norm(sub(ip, [PUFF_C[0], PUFF_C[1], 0]));
      const up: [number, number, number] = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      const ax = norm(cross(dir, up)), bx = norm(cross(dir, ax));
      const rr = 0.012 * L;
      b.tag(from, (k, A) => {
        A.morphOff ??= [];
        const q = b.lo.pos(k);
        let target: [number, number, number];
        if (k === tip) target = add(ip, scale(dir, sl * (0.8 + 0.4 * ((i * 7 + j * 3) % 5) / 5)));
        else { const ang = ((k - from) / 4) * Math.PI * 2; target = add(add(ip, scale(dir, -0.005 * L)), add(scale(ax, Math.cos(ang) * rr), scale(bx, Math.sin(ang) * rr))); }
        A.morphOff[k] = sub(target, q);
      });
    }
  },
  swim: { k: 0.6, a0: 0.02, pow: 3, amp: 0.05, freq: 1.0, freqK: 0.4, flutter: [12, 0.025], ripple: 0.02 },
  clearcoat: 0.6,
};

// ------------------------------------------------------------------------------------------- moray eel
// Honeycomb moray: long, muscular, laterally flattened toward the tail; one continuous fin from the nape
// round the tail to the belly; gaping jaws lined with fangs; tube nostrils; brown spots in a pale net.
const moray: FishSpec = {
  name: 'moray', L: 2.0, body: 0.985, rings: 120, seg: 24, page: [512, 256], bodyH: 100,
  top: [[0, 0.0], [0.006, 0.011], [0.02, 0.026], [0.04, 0.04], [0.07, 0.052], [0.1, 0.057], [0.16, 0.054], [0.35, 0.05], [0.6, 0.045], [0.82, 0.035], [0.95, 0.02], [1, 0.008]],
  bot: [[0, 0.0], [0.006, 0.008], [0.02, 0.02], [0.05, 0.034], [0.1, 0.046], [0.2, 0.047], [0.6, 0.042], [0.85, 0.031], [1, 0.008]],
  wid: [[0, 0.0], [0.01, 0.012], [0.04, 0.028], [0.1, 0.038], [0.4, 0.034], [0.7, 0.025], [0.9, 0.013], [1, 0.004]],
  cy: [[0, -0.004], [0.06, 0], [1, 0]],
  mouth: { t: 0.06, th: [[0, 0.5], [0.06, 0.54]], open: 0.55, idle: 0.3, interior: '#7a3a3a', crease: '#1a1408', lip: 0.04, lipCol: '#c8b880',
    teeth: { upper: 8, lower: 8, size: 0.0085, style: 'fang', inset: 0.86, t0: 0.006, t1: 0.05, rake: 0.35 } },
  eye: { t: 0.034, y: 0.6, r: 0.0105, fwd: 0.3, up: 0.25, lid: 'angry', lidCol: '#7a6a3a', lidLine: '#1a1408', lidTilt: 0.5, lidLevel: 0.25, bulge: 0.7,
    paint: { iris: ['#2a2a08', '#8a8a20', '#e0e050', '#ffffa0'], pupil: 0.5, ring: '#ffffd0', sclera: '#e8e0b0', irisR: 0.86 } },
  rough: 0.32, sheen: 0.3,
  paint: (c) => {
    const cell = 8 + c.t * 5;
    const [f1, f2] = worley(c.px * 1.0, c.py * 1.3, cell, 31);
    let col = grad(['#e8d890', '#d8c470', '#c8b060'])(0.5 - c.yn * 0.4, c.px, c.py);
    const spot = f2 - f1;
    if (spot > 2.2) col = grad(['#2a1e0c', '#3e2c12', '#5a4018'])(Math.min(1, (spot - 2.2) / 6), c.px, c.py);
    else if (spot > 1.3) col = mix(col, C('#7a6028'), 0.6);
    if (c.yn < -0.6) col = mix(col, C('#f0e4b0'), 0.4);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.09, t1: 0.995, h: [[0, 0.004], [0.05, 0.018], [0.5, 0.02], [0.92, 0.022], [1, 0.02]], sweep: 0.2, cols: 60, rows: 3, col: ['#c8b060', '#a08840', '#5a4018'], rays: 60, rayCol: '#5a4018', edge: '#2a1e0c', edgeW: 0.2, alpha: [1, 0.95], opaque: true, ripple: 0.6, px: [400, 16],
      over: (u, v, c, i) => (((i >> 2) % 3 === 0) ? shade(c, 0.6) : null) },
    { type: 'anal', t0: 0.45, t1: 0.995, h: [[0, 0.004], [0.08, 0.015], [1, 0.02]], sweep: 0.2, cols: 40, rows: 3, col: ['#c8b060', '#a08840', '#5a4018'], rays: 40, rayCol: '#5a4018', edge: '#2a1e0c', edgeW: 0.2, alpha: [1, 0.95], opaque: true, ripple: 0.6, px: [220, 16] },
  ],
  extras: (b) => {
    // tube nostrils at the snout tip
    const rect = b.pg.alloc(6, 8);
    paintSwatch(b.pg, rect, ['#e8d890', '#c8b060', '#7a6028'], 0.4);
    for (const side of [1, -1]) {
      const p = b.surf(0.012, Math.PI * 0.3); p[2] *= side;
      b.cone(p, [0.6, 0.8, 0.35 * side], 0.012 * b.L, 0.0028 * b.L, rect, 5, { flutter: 0.0 });
    }
  },
  swim: { k: 1.45, a0: 0.12, pow: 1.15, amp: 0.06, freq: 0.9, freqK: 0.9, ripple: 0.006 },
  clearcoat: 0.75, clearcoatRough: 0.25,
};

// ------------------------------------------------------------------------------------------- anglerfish
const photophore = (c: PaintCtx) => c.t > 0.3 && c.t < 0.88 && Math.abs(c.yn - 0.05 + (c.t - 0.3) * 0.2) < 0.03 && (c.px % 14) === 0 && Math.abs(c.side) > 0.4;
// Humpback anglerfish: a globe of a head that is mostly mouth, needle fangs, tiny pale eyes, black velvet skin;
// a fishing rod (illicium) arches from the forehead to a glowing esca dangling in front of the jaws.
const anglerfish: FishSpec = {
  name: 'anglerfish', L: 0.6, body: 0.82, page: [512, 512], seg: 32, rings: 48,
  top: [[0, 0.0], [0.015, 0.06], [0.06, 0.15], [0.14, 0.23], [0.26, 0.27], [0.4, 0.26], [0.55, 0.21], [0.72, 0.13], [0.88, 0.07], [1, 0.055]],
  bot: [[0, 0.0], [0.015, 0.09], [0.06, 0.2], [0.14, 0.27], [0.26, 0.28], [0.4, 0.24], [0.56, 0.17], [0.72, 0.1], [0.88, 0.06], [1, 0.05]],
  wid: [[0, 0.0], [0.02, 0.07], [0.08, 0.15], [0.2, 0.2], [0.38, 0.19], [0.6, 0.13], [0.8, 0.07], [1, 0.03]],
  cy: [[0, 0.04], [0.15, 0.0], [0.4, -0.01], [1, 0.0]],
  sq: [[0, 2.0], [0.4, 2.1], [1, 2.3]],
  mouth: { t: 0.24, th: [[0, 0.3], [0.12, 0.42], [0.24, 0.52]], open: 0.95, idle: 0.18, lip: 0.05, lipCol: '#3a2a30', interior: '#1a0610', crease: '#0a0408',
    teeth: { upper: 9, lower: 10, size: 0.07, lowerSize: 0.085, style: 'fang', inset: 0.95, t0: 0.01, t1: 0.2, rake: 0.08, col: ['#ffffff', '#e8f0f0', '#b8c8c8', '#5a6060'] } },
  eye: { t: 0.2, y: 0.62, r: 0.02, fwd: 0.3, up: 0.3, lid: 'angry', lidCol: '#2a2024', lidLine: '#050304', lidTilt: 0.6, lidLevel: 0.2, bulge: 0.7,
    paint: { iris: ['#2a3a48', '#6a8aa0', '#b8d8e8', '#f0ffff'], pupil: 0.45, ring: '#ffffff', sclera: '#a0b0b8', irisR: 0.86 } },
  rough: 0.62, sheen: 0, normal: 3,
  scales: { w: 4, h: 4, k: 0.25, rim: 0.05, hi: 0.0, bump: 1.2, tMin: 0.0 },
  emissive: 2.2,
  glow: (c) => (photophore(c) ? [40, 150, 175] : null),
  paint: (c) => {
    let col = grad(['#141016', '#1e1820', '#2a2028', '#3a2a30', '#4a3438'])(0.35 - c.yn * 0.45, c.px, c.py);
    // velvety mottling + sparse pale pores
    const n = noise2(c.X * 40, c.Y * 40 + (c.Z > 0 ? 0 : 30), 8);
    col = shade(col, 0.85 + n * 0.3);
    if (hash2(c.px, c.py, 3) < 0.012) col = mix(col, C('#8a7a80'), 0.6);
    // photophore row
    if (photophore(c)) col = C('#a0f8ff');
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.66, t1: 0.76, h: [[0, 0.06], [0.5, 0.065], [1, 0.03]], sweep: 0.4, col: ['#2a2028', '#1e1820'], rays: 6, rayCol: '#4a3a40', alpha: [0.95, 0.8], ripple: 0.5, px: [40, 32] },
    { type: 'anal', t0: 0.7, t1: 0.8, h: [[0, 0.05], [0.5, 0.055], [1, 0.03]], sweep: 0.4, col: ['#2a2028', '#1e1820'], rays: 5, rayCol: '#4a3a40', alpha: [0.95, 0.8], ripple: 0.5, px: [40, 32] },
    { type: 'caudal', shape: 'round', len: 0.17, span: 0.1, col: ['#2a2028', '#241c24', '#1a141a'], rays: 9, rayCol: '#4a3a40', alpha: [0.95, 0.75], px: [64, 56] },
    { type: 'pectoral', t: 0.44, y: -0.3, len: 0.09, baseLen: 0.05, angle: 15, col: ['#2a2028', '#1e1820'], rays: 9, rayCol: '#4a3a40', alpha: [0.9, 0.7], flutter: 0.1, out: 0.5 },
  ],
  extras: (b) => {
    const stalk = b.pg.alloc(8, 16), bulb = b.pg.alloc(16, 16);
    paintSwatch(b.pg, stalk, ['#3a2a30', '#2a2028', '#1e1820'], 0.6);
    paintSwatch(b.pg, bulb, ['#f0ffff', '#a8f8ff', '#40d0f0', '#108090'], 0.2, ['#ffffff', '#c0ffff', '#40e0ff', '#0a6070']);
    const L = b.L;
    const root = b.surf(0.06, 0.05);
    const path: [number, number, number][] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      const ang = Math.PI * 0.5 - u * Math.PI * 0.95;
      path.push([root[0] + Math.cos(ang) * 0.11 * L + u * 0.08 * L, root[1] + Math.sin(ang) * 0.13 * L + 0.03 * L * u, 0]);
    }
    b.tube(path, (t) => (0.007 - t * 0.003) * L, 6, stalk, { flutter: 0.9, phase: 0 });
    const tip = path[path.length - 1];
    const esca: [number, number, number] = [tip[0], tip[1] - 0.018 * L, tip[2]];
    b.blob(esca, [0.022 * L, 0.026 * L, 0.022 * L], bulb, { flutter: 0.9 });
    b.anchors.lure = esca;
    // lure filaments
    for (const k of [-1, 0, 1]) b.cone([esca[0], esca[1] - 0.015 * L, 0], [k * 0.4, -1, k * 0.2], 0.03 * L, 0.003 * L, bulb, 4, { flutter: 1.0, phase: k });
  },
  swim: { k: 0.7, a0: 0.02, pow: 2.5, amp: 0.05, freq: 0.6, freqK: 0.6, flutter: [2.2, 0.03], ripple: 0.012 },
  clearcoat: 0.25, clearcoatRough: 0.5,
};

// ------------------------------------------------------------------------------------------- ichthyosaur (boss)
// Dolphin-shaped marine reptile: long toothy rostrum, enormous eye ringed with bony plates, deep chest, slim
// tailstock, crescent tail, tall dorsal and paddle flippers. Golden hide with black tiger stripes.
const ichthyosaur: FishSpec = {
  name: 'ichthyosaur', L: 7, body: 0.85, page: [512, 512], bodyH: 256, rings: 64, seg: 32,
  top: [[0, 0.0], [0.01, 0.006], [0.05, 0.012], [0.1, 0.02], [0.14, 0.036], [0.18, 0.064], [0.24, 0.094], [0.34, 0.118], [0.46, 0.12], [0.62, 0.098], [0.78, 0.058], [0.92, 0.028], [1, 0.022]],
  bot: [[0, 0.0], [0.01, 0.005], [0.05, 0.01], [0.1, 0.017], [0.15, 0.034], [0.2, 0.062], [0.3, 0.104], [0.42, 0.122], [0.58, 0.104], [0.74, 0.062], [0.9, 0.028], [1, 0.021]],
  wid: [[0, 0.0], [0.02, 0.007], [0.1, 0.016], [0.18, 0.052], [0.3, 0.092], [0.5, 0.094], [0.7, 0.06], [0.9, 0.022], [1, 0.016]],
  cy: [[0, -0.004], [0.14, -0.002], [0.3, 0], [1, 0.002]],
  sq: [[0, 2.0], [0.2, 2.0], [0.9, 2.3], [1, 2.6]],
  mouth: { t: 0.15, th: [[0, 0.5], [0.15, 0.53]], open: 0.6, idle: 0.04, lip: 0.04, lipCol: '#8a6020', interior: '#6a1a24', crease: '#1a1008',
    teeth: { upper: 22, lower: 22, size: 0.0085, style: 'peg', inset: 0.93, t0: 0.006, t1: 0.13, col: ['#fffef0', '#f0e8d0', '#d0c098', '#906848'] } },
  eye: { t: 0.168, y: 0.36, r: 0.024, fwd: 0.2, up: 0.06, lid: 'angry', lidCol: '#a07020', lidLine: '#1a0e04', lidTilt: 0.6, lidLevel: 0.28, bulge: 0.6,
    paint: { iris: ['#3a1a04', '#a85010', '#f0a020', '#ffe070'], pupil: 0.42, ring: '#fff0a0', sclera: '#c8b890', irisR: 0.74, slit: 0.6 } },
  scales: { w: 6, h: 5, k: 0.35, rim: 0.08, hi: 0.03, bump: 0.6, tMin: 0.12 },
  rough: 0.44, sheen: 0.3,
  paint: (c) => {
    let col = grad(['#5a3a10', '#8a5a18', '#c08a28', '#e0ac3c', '#ecc870', '#f4e2b0', '#f8f0d8'])(0.36 - c.yn * 0.58, c.px, c.py);
    // bony sclerotic ring around the eye
    const ey = c.eyeD / (0.024 * 7);
    if (ey > 1.0 && ey < 1.4) col = (Math.floor(Math.atan2(c.Y - 0.0, c.X) * 12 + c.eyeD * 400) % 2) ? C('#b08840') : C('#8a6428');
    // tiger stripes: wavy, tapering toward the belly, absent on the snout
    if (c.t > 0.17 && c.yn > -0.55) {
      const wob = Math.sin(c.yn * 5 + c.t * 12) * 0.012 + noise2(c.t * 60, c.yn * 3, 4) * 0.012;
      const ph = (c.t + wob) * 26 + c.yn * 0.8;
      const fr = ((ph % 1) + 1) % 1;
      const w = 0.32 * (0.55 + 0.45 * smoothstep(-0.55, 0.6, c.yn));
      if (fr < w) col = dmix(col, C('#18100a'), Math.min(1, (w - fr) * 14) * (c.yn < -0.3 ? 0.7 : 1), c.px, c.py);
    }
    // freckles on the snout
    if (c.t < 0.17 && c.yn > -0.2 && hash2(c.px >> 1, c.py >> 1, 6) < 0.08) col = shade(col, 0.6);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.42, t1: 0.56, h: [[0, 0.06], [0.35, 0.085], [0.6, 0.07], [1, 0.012]], sweep: 0.9, lean: [[0, 0], [0.5, 0.3], [1, 1.2]], col: ['#c08a28', '#a06c1c', '#3a2408'], rays: 0, opaque: true, thick: 0.004, alpha: [1, 1], px: [96, 64],
      over: (u, v) => ((u * 5 + v * 2) % 1 < 0.35 ? C('#1a120a') : null) },
    { type: 'caudal', shape: 'lunate', len: 0.17, span: 0.14, col: ['#b07a22', '#8a5a18', '#3a2408'], rays: 0, opaque: true, thick: 0.004, alpha: [1, 1], px: [128, 100],
      ext: (u) => { const w = Math.abs(2 * u - 1); return 0.22 + 0.78 * Math.pow(w, 0.6); },
      over: (u, v) => ((v * 4 + u * 0.5) % 1 < 0.3 ? C('#1a120a') : null) },
    { type: 'pectoral', t: 0.25, y: -0.75, len: 0.12, baseLen: 0.04, span: 0.35, angle: 38, shape: 'pointed', col: ['#d8a040', '#b07a22', '#5a3a10'], rays: 0, opaque: true, thick: 0.006, out: 0.35, flutter: 0.05, px: [64, 40],
      over: (u, v, c, i, j) => (((i + j * 2) >> 2) % 4 === 0 ? shade(c, 0.85) : null) },
    { type: 'pelvic', t: 0.55, len: 0.06, angle: 50, shape: 'pointed', col: ['#d8a040', '#b07a22'], rays: 0, opaque: true, thick: 0.005, out: 0.4, flutter: 0.03 },
  ],
  swim: { k: 0.7, a0: 0.015, pow: 2.8, amp: 0.075, freq: 0.5, freqK: 1.0, flutter: [1.6, 0.02] },
  clearcoat: 0.45, clearcoatRough: 0.35,
};

// ------------------------------------------------------------------------------------------- pumpkinseed
// Sunfish: a round, flat pan of a fish; olive-gold flanks speckled orange, wavy blue cheek lines, a black ear
// flap tipped with a scarlet spot, sunset-orange belly.
const pumpkinseed: FishSpec = {
  name: 'pumpkinseed', L: 0.26, body: 0.8,
  top: [[0, 0.0], [0.02, 0.04], [0.07, 0.1], [0.15, 0.16], [0.28, 0.21], [0.42, 0.225], [0.58, 0.2], [0.74, 0.13], [0.88, 0.08], [1, 0.07]],
  bot: [[0, 0.0], [0.02, 0.035], [0.08, 0.08], [0.18, 0.15], [0.32, 0.2], [0.46, 0.21], [0.62, 0.17], [0.78, 0.1], [0.9, 0.07], [1, 0.064]],
  wid: [[0, 0.0], [0.03, 0.03], [0.12, 0.05], [0.3, 0.062], [0.55, 0.055], [0.8, 0.035], [1, 0.02]],
  cy: [[0, 0.005], [0.3, 0], [1, 0.004]],
  mouth: { t: 0.045, th: 0.46, open: 0.4, lip: 0.08, lipCol: '#6a6a30', crease: '#2a2a10' },
  eye: { t: 0.13, y: 0.38, r: 0.05, fwd: 0.2, up: 0.1, lid: 'none',
    paint: { iris: ['#2a1a08', '#8a4a10', '#e09030', '#ffd070'], pupil: 0.52, ring: '#fff0a0', sclera: '#c8c090', irisR: 0.86 } },
  gill: { t: 0.24, col: '#2a3a20', curve: 0.03, k: 0.5 },
  scales: { w: 6, h: 4, k: 0.9, rim: 0.12, hi: 0.06 },
  sheen: 0.3, rough: 0.38,
  paint: (c) => {
    let col = grad(['#3a4a20', '#5a6a28', '#8a8a38', '#b8a848', '#d8a040', '#f08a30', '#f8b060'])(0.38 - c.yn * 0.62, c.px, c.py);
    // orange speckles on scale caps
    if (c.t > 0.2 && c.sd < 0.4 && c.sid < 0.4 && c.yn > -0.5) col = mix(col, C('#f08a30'), 0.8);
    if (c.t > 0.2 && c.sd < 0.35 && c.sid > 0.85) col = mix(col, C('#58c0b0'), 0.6);
    // wavy blue lines across the cheek
    if (c.t < 0.26 && c.yn < 0.55 && c.yn > -0.6) { const wv = Math.sin(c.yl * 300 + Math.sin(c.X * 200) * 1.2); if (wv > 0.8) col = C('#58b8e8'); }
    // the "ear" flap: black with a scarlet tip
    const ex = (c.t - 0.255) * 9, ey = (c.yn - 0.1) * 3;
    const ed = Math.hypot(ex, ey);
    if (ed < 0.35) col = ex > 0.12 ? C('#e82a1a') : C('#101010');
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.3, t1: 0.86, h: [[0, 0.05], [0.4, 0.075], [0.55, 0.07], [0.8, 0.1], [1, 0.05]], sweep: 0.35, col: ['#5a6a30', '#6a7a38', '#8a8a48'], spines: 10, rays: 10, notch: 0.22, spineCol: '#a8a868', rayCol: '#3a4a20', spots: '#e09040', spotK: 0.08, alpha: [0.88, 0.6], ripple: 0.3, px: [128, 32] },
    { type: 'anal', t0: 0.62, t1: 0.88, h: [[0, 0.05], [0.6, 0.08], [1, 0.05]], sweep: 0.5, col: ['#6a7a38', '#8a8a48'], spines: 3, rays: 9, notch: 0.2, spineCol: '#a8a868', alpha: [0.88, 0.6], ripple: 0.3, px: [64, 28] },
    { type: 'caudal', shape: 'emarginate', len: 0.18, span: 0.12, col: ['#5a6a30', '#7a8040', '#8a8a48'], rays: 14, rayCol: '#3a4a20', alpha: [0.88, 0.6], px: [64, 48] },
    { type: 'pectoral', t: 0.27, y: -0.2, len: 0.12, angle: 15, shape: 'pointed', col: ['#d8c890', '#c0b070'], rays: 10, alpha: [0.55, 0.3], flutter: 0.07, out: 0.7 },
    { type: 'pelvic', t: 0.32, len: 0.08, angle: 55, col: ['#e09040', '#c87030'], rays: 6, alpha: [0.85, 0.6], flutter: 0.03 },
  ],
  swim: { k: 0.8, a0: 0.03, pow: 2.4, amp: 0.09, freq: 1.3, freqK: 1.0, flutter: [7, 0.022], ripple: 0.014 },
};

// ------------------------------------------------------------------------------------------- orangespine unicornfish
// Naso lituratus: oval grey-brown surgeonfish with bright orange lips, a yellow mask line from the eye to the
// mouth, black dorsal with a white edge, lyre tail with streamer filaments and two orange scalpel spines.
const unicornfish: FishSpec = {
  name: 'unicornfish', L: 0.42, body: 0.78,
  top: [[0, 0.0], [0.02, 0.03], [0.08, 0.075], [0.18, 0.135], [0.3, 0.175], [0.45, 0.185], [0.62, 0.16], [0.78, 0.1], [0.9, 0.055], [1, 0.045]],
  bot: [[0, 0.0], [0.02, 0.03], [0.08, 0.06], [0.2, 0.11], [0.35, 0.155], [0.5, 0.165], [0.66, 0.135], [0.82, 0.075], [1, 0.042]],
  wid: [[0, 0.0], [0.03, 0.025], [0.15, 0.045], [0.35, 0.056], [0.6, 0.048], [0.85, 0.028], [1, 0.016]],
  cy: [[0, -0.02], [0.2, -0.004], [1, 0.004]],
  mouth: { t: 0.035, th: 0.52, open: 0.35, lip: 0.14, lipCol: '#ff7a10', crease: '#4a1a08' },
  eye: { t: 0.22, y: 0.42, r: 0.034, fwd: 0.15, up: 0.1, lid: 'none',
    paint: { iris: ['#1a1408', '#5a4010', '#a07a20', '#e0c050'], pupil: 0.5, ring: '#ffe080', sclera: '#a09888', irisR: 0.88 } },
  rough: 0.4, sheen: 0.2,
  scales: { w: 4, h: 3, k: 0.4, rim: 0.06, hi: 0.03 },
  paint: (c) => {
    let col = grad(['#3a342c', '#4a443a', '#5e584c', '#757062', '#8c8678', '#a8a294'])(0.38 - c.yn * 0.5, c.px, c.py);
    // orange-yellow crescent behind the lips, yellow mask from eye to mouth
    const mx = c.t - 0.06 - Math.abs(c.yn) * 0.05;
    if (mx > 0 && mx < 0.03 && c.yn < 0.5) col = C('#ffb020');
    const mask = (c.yn - 0.42) + (0.22 - c.t) * 1.2;
    if (c.t < 0.21 && c.t > 0.05 && Math.abs(mask) < 0.07) col = C('#f8c830');
    // two orange scalpel plates on the caudal peduncle
    for (const pt of [0.88, 0.95]) { const d = Math.hypot((c.t - pt) * 30, (c.yn) * 1.6); if (d < 0.75 && Math.abs(c.side) > 0.3) col = d < 0.5 ? C('#ff6a10') : C('#a03a08'); }
    // dark mask through the forehead
    if (c.t < 0.3 && c.yn > 0.5) col = shade(col, 0.85);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.22, t1: 0.88, h: [[0, 0.05], [0.2, 0.07], [0.8, 0.065], [1, 0.03]], sweep: 0.3, col: ['#141414', '#1a1a1a', '#202020'], edge: '#f4f4f0', edgeW: 0.14, spines: 6, rays: 22, notch: 0.15, spineCol: '#303030', rayCol: '#2a2a2a', alpha: [0.95, 0.85], ripple: 0.3, px: [140, 28],
      base: '#f8b020', baseW: 0.12 },
    { type: 'anal', t0: 0.5, t1: 0.88, h: [[0, 0.05], [0.5, 0.06], [1, 0.03]], sweep: 0.3, col: ['#3a342c', '#2a2620'], edge: '#ff9020', edgeW: 0.14, spines: 2, rays: 20, rayCol: '#1a1814', alpha: [0.95, 0.85], ripple: 0.3, px: [96, 24] },
    { type: 'caudal', shape: 'lyre', len: 0.24, span: 0.15, col: ['#4a443a', '#5e584c', '#6a6458'], edge: '#ffd030', edgeW: 0.08, rays: 14, rayCol: '#2a2620', alpha: [0.95, 0.8], px: [80, 64],
      ext: (u) => { const w = Math.abs(2 * u - 1); return 0.48 + 0.25 * Math.pow(w, 2) + (w > 0.9 ? (w - 0.9) * 5.2 : 0); } },
    { type: 'pectoral', t: 0.3, y: -0.15, len: 0.11, angle: 10, shape: 'pointed', col: ['#5e584c', '#757062'], rays: 9, alpha: [0.75, 0.45], flutter: 0.09, out: 0.7 },
    { type: 'pelvic', t: 0.32, len: 0.05, angle: 55, col: ['#3a342c', '#2a2620'], rays: 4, alpha: [0.9, 0.7], flutter: 0.03 },
  ],
  swim: { k: 0.6, a0: 0.02, pow: 2.8, amp: 0.05, freq: 1.0, freqK: 0.7, flutter: [5, 0.04], ripple: 0.012 },
};

// ------------------------------------------------------------------------------------------- grouper
// Big-mouthed sea bass: robust body, jutting lower jaw, rounded tail; green-grey with darker blotches and pale spots.
const grouper: FishSpec = {
  name: 'grouper', L: 1.0, body: 0.82, page: [512, 512],
  top: [[0, 0.0], [0.02, 0.025], [0.08, 0.06], [0.18, 0.1], [0.32, 0.128], [0.48, 0.13], [0.64, 0.115], [0.8, 0.08], [0.92, 0.062], [1, 0.058]],
  bot: [[0, 0.0], [0.02, 0.035], [0.08, 0.07], [0.2, 0.105], [0.36, 0.122], [0.52, 0.12], [0.68, 0.095], [0.84, 0.066], [1, 0.054]],
  wid: [[0, 0.0], [0.03, 0.035], [0.12, 0.065], [0.3, 0.08], [0.55, 0.074], [0.8, 0.045], [1, 0.024]],
  cy: [[0, -0.018], [0.2, 0], [1, 0.004]],
  mouth: { t: 0.11, th: [[0, 0.5], [0.11, 0.53]], open: 0.7, lip: 0.08, lipCol: '#6a7058', interior: '#6a2a30', crease: '#1a1e14',
    teeth: { upper: 8, lower: 8, size: 0.007, style: 'needle', inset: 0.85 } },
  eye: { t: 0.12, y: 0.45, r: 0.026, fwd: 0.2, up: 0.15, lid: 'sleepy', lidCol: '#4a5240', lidLine: '#141810', lidLevel: 0.35, lidTilt: 0.2,
    paint: { iris: ['#2a2a10', '#6a6a28', '#b0a850', '#e8e090'], pupil: 0.5, ring: '#f0f0b0', sclera: '#a8a888', irisR: 0.86 } },
  gill: { t: 0.27, col: '#2a3020', curve: 0.04, k: 0.5 },
  scales: { w: 6, h: 4, k: 0.8, rim: 0.12, hi: 0.05 },
  rough: 0.42, sheen: 0.25,
  paint: (c) => {
    let col = grad(['#2a3424', '#3a4630', '#52604a', '#6e7a62', '#8a947a', '#b0b49c', '#ccccb4'])(0.38 - c.yn * 0.6, c.px, c.py);
    // dark irregular blotches arranged in vertical bands
    const n = noise2(c.X * 9, c.yl * 30, 3) + 0.3 * Math.sin(c.t * 28);
    if (n > 0.68 && c.yn > -0.6) col = dmix(col, C('#1e261a'), Math.min(1, (n - 0.68) * 6), c.px, c.py);
    // pale spots
    if (c.sid < 0.12 && c.sd < 0.55 && c.t > 0.1) col = mix(col, C('#d8dcc4'), 0.7);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.3, t1: 0.82, h: [[0, 0.05], [0.3, 0.075], [0.55, 0.06], [0.75, 0.085], [1, 0.05]], sweep: 0.35, col: ['#3a4630', '#4a5640', '#5a6650'], spines: 11, rays: 14, notch: 0.25, spineCol: '#8a947a', rayCol: '#2a3424', spots: '#a8b098', spotK: 0.08, alpha: [0.92, 0.75], ripple: 0.3, px: [220, 40] },
    { type: 'anal', t0: 0.64, t1: 0.86, h: [[0, 0.05], [0.6, 0.08], [1, 0.05]], sweep: 0.45, col: ['#3a4630', '#4a5640'], spines: 3, rays: 8, notch: 0.2, spineCol: '#8a947a', alpha: [0.92, 0.75], ripple: 0.3, px: [100, 36] },
    { type: 'caudal', shape: 'round', len: 0.18, span: 0.11, col: ['#3a4630', '#4a5640', '#5a6650'], edge: '#c8ccb0', edgeW: 0.06, rays: 14, rayCol: '#2a3424', spots: '#a8b098', spotK: 0.08, alpha: [0.92, 0.75], px: [100, 80] },
    { type: 'pectoral', t: 0.28, y: -0.3, len: 0.12, angle: 15, col: ['#5a6650', '#6e7a62'], rays: 14, rayCol: '#3a4630', alpha: [0.85, 0.6], flutter: 0.06, out: 0.6, px: [64, 40] },
    { type: 'pelvic', t: 0.33, len: 0.08, angle: 55, col: ['#3a4630', '#4a5640'], rays: 6, alpha: [0.9, 0.7], flutter: 0.03 },
  ],
  swim: { k: 0.8, a0: 0.025, pow: 2.5, amp: 0.07, freq: 0.7, freqK: 0.8, flutter: [3.5, 0.022], ripple: 0.008 },
};

// ------------------------------------------------------------------------------------------- northern pike
// Long torpedo with a flat duck-bill snout full of needle teeth; dorsal and anal set far back by the tail;
// green with rows of pale yellow bean spots, white belly, spotted orange-tinted fins.
const pike: FishSpec = {
  name: 'pike', L: 1.0, body: 0.84, rings: 60, page: [512, 256], bodyH: 128,
  top: [[0, 0.0], [0.02, 0.008], [0.06, 0.016], [0.12, 0.028], [0.18, 0.042], [0.26, 0.055], [0.45, 0.064], [0.65, 0.062], [0.82, 0.05], [0.94, 0.038], [1, 0.034]],
  bot: [[0, 0.0], [0.02, 0.01], [0.06, 0.018], [0.12, 0.03], [0.2, 0.044], [0.35, 0.056], [0.55, 0.06], [0.75, 0.052], [0.9, 0.038], [1, 0.032]],
  wid: [[0, 0.0], [0.02, 0.016], [0.08, 0.028], [0.2, 0.04], [0.45, 0.046], [0.75, 0.034], [1, 0.018]],
  sq: [[0, 2.8], [0.1, 2.3], [0.25, 2.0], [1, 2.2]],
  cy: [[0, -0.004], [0.2, 0], [1, 0.002]],
  mouth: { t: 0.13, th: 0.5, open: 0.6, lip: 0.04, lipCol: '#a0a878', interior: '#7a3a3a', crease: '#1a2010',
    teeth: { upper: 12, lower: 12, size: 0.006, style: 'needle', inset: 0.88, t0: 0.01 } },
  eye: { t: 0.14, y: 0.55, r: 0.019, fwd: 0.35, up: 0.3, lid: 'angry', lidCol: '#4a6a30', lidLine: '#121a0a', lidTilt: 0.4, lidLevel: 0.38,
    paint: { iris: ['#2a2a08', '#8a8a20', '#e0d040', '#fff8a0'], pupil: 0.48, ring: '#ffffc0', sclera: '#c8c8a0', irisR: 0.86 } },
  gill: { t: 0.25, col: '#1a2a10', curve: 0.02, hi: '#d8e8a0', k: 0.45 },
  lateral: { y: 0.0, col: '#e8f0b0', t0: 0.28, t1: 0.96 },
  scales: { w: 4, h: 3, k: 0.6, rim: 0.08, hi: 0.04 },
  rough: 0.36, sheen: 0.35,
  paint: (c) => {
    let col = grad(['#1e3214', '#2c4a1c', '#3e6226', '#5a7e32', '#8aa048', '#d8dcb0', '#f4f2e4'])(0.36 - c.yn * 0.62, c.px, c.py);
    // rows of pale bean-shaped spots / short bars on the flank
    if (c.t > 0.22 && c.yn > -0.55 && c.yn < 0.75) {
      const row = Math.round(c.yn * 4.2), off = (row & 1) * 0.5 + hash2(row, 3, 1) * 0.3;
      const cell = Math.floor(c.t * 30 + off), bx = (c.t * 30 + off) % 1, by = c.yn * 4.2 - row;
      const jx = (hash2(cell, row, 5) - 0.5) * 0.3, jy = (hash2(cell, row, 6) - 0.5) * 0.3, sz = 0.26 + hash2(cell, row, 7) * 0.16;
      const d = Math.hypot((bx - 0.5 - jx) * 1.5, (by - jy) * 0.85);
      if (d < sz) col = mix(C('#ece4a0'), C('#c8c060'), d / sz);
    }
    if (c.t < 0.2 && c.yn > 0.2) col = shade(col, 0.88);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.74, t1: 0.9, h: [[0, 0.06], [0.4, 0.075], [1, 0.04]], sweep: 0.4, col: ['#4a5a2a', '#6a6a30', '#a07030'], rays: 14, rayCol: '#2a3410', spots: '#1a2010', spotK: 0.12, alpha: [0.92, 0.75], ripple: 0.3, px: [64, 40] },
    { type: 'anal', t0: 0.76, t1: 0.9, h: [[0, 0.055], [0.4, 0.068], [1, 0.035]], sweep: 0.4, col: ['#8a7a3a', '#b07a30', '#c06a28'], rays: 12, rayCol: '#5a4010', spots: '#2a1a08', spotK: 0.12, alpha: [0.92, 0.75], ripple: 0.3, px: [64, 36] },
    { type: 'caudal', shape: 'fork', len: 0.15, span: 0.1, col: ['#6a6a30', '#9a7a34', '#c07030'], rays: 16, rayCol: '#3a3410', spots: '#1a1a08', spotK: 0.12, alpha: [0.92, 0.75], px: [80, 64], ext: (u) => { const w = Math.abs(2 * u - 1); return 0.62 + 0.38 * Math.pow(w, 1.2); } },
    { type: 'pectoral', t: 0.27, y: -0.6, len: 0.07, angle: 25, col: ['#c0a050', '#b08040'], rays: 10, alpha: [0.75, 0.45], flutter: 0.06 },
    { type: 'pelvic', t: 0.52, len: 0.06, angle: 50, col: ['#c0a050', '#b08040'], rays: 8, alpha: [0.8, 0.5], flutter: 0.03 },
  ],
  swim: { k: 0.9, a0: 0.02, pow: 2.6, amp: 0.08, freq: 0.9, freqK: 1.2, flutter: [5, 0.015] },
  clearcoat: 0.6,
};

// ------------------------------------------------------------------------------------------- red snapper (rockfish)
// Triangular-headed reef snapper: rosy red fading to pink-silver below, red eye, spiny dorsal, slightly forked tail.
const snapper: FishSpec = {
  name: 'snapper', L: 0.6, body: 0.8,
  top: [[0, 0.0], [0.02, 0.03], [0.08, 0.075], [0.18, 0.13], [0.3, 0.165], [0.42, 0.17], [0.58, 0.15], [0.74, 0.1], [0.88, 0.064], [1, 0.058]],
  bot: [[0, 0.0], [0.02, 0.025], [0.08, 0.05], [0.2, 0.09], [0.36, 0.12], [0.52, 0.12], [0.68, 0.09], [0.84, 0.062], [1, 0.054]],
  wid: [[0, 0.0], [0.03, 0.028], [0.15, 0.055], [0.35, 0.066], [0.6, 0.055], [0.85, 0.03], [1, 0.018]],
  cy: [[0, -0.02], [0.2, -0.004], [1, 0.006]],
  mouth: { t: 0.09, th: [[0, 0.5], [0.09, 0.54]], open: 0.6, lip: 0.06, lipCol: '#d84030', interior: '#7a1a24', crease: '#3a0a0a',
    teeth: { upper: 6, lower: 6, size: 0.008, style: 'needle', inset: 0.85 } },
  eye: { t: 0.15, y: 0.48, r: 0.04, fwd: 0.2, up: 0.1, lid: 'none',
    paint: { iris: ['#4a0606', '#b01410', '#f0301a', '#ff8060'], pupil: 0.52, ring: '#ffc0a0', sclera: '#e0a8a0', irisR: 0.86 } },
  gill: { t: 0.26, col: '#7a1a14', curve: 0.03, hi: '#ffc0b0', k: 0.5 },
  lateral: { y: 0.35, col: '#ffd8d0', arch: 0.015, t0: 0.26 },
  scales: { w: 6, h: 4, k: 1, rim: 0.13, hi: 0.07 },
  sheen: 0.5, rough: 0.34,
  paint: (c) => {
    let col = grad(['#6a0a0c', '#a01a14', '#d03420', '#e85a40', '#f08a78', '#f8c0b0', '#fff0ea'])(0.3 - c.yn * 0.62, c.px, c.py);
    // faint diagonal rows of darker scale centres (snapper pin-striping)
    if (c.t > 0.22 && c.sd < 0.45 && ((c.py + c.px) % 9) < 2 && c.yn > -0.3) col = shade(col, 0.85);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.3, t1: 0.8, h: [[0, 0.05], [0.25, 0.085], [0.55, 0.06], [0.75, 0.075], [1, 0.04]], sweep: 0.4, col: ['#d84a3a', '#e86a50', '#f08a70'], spines: 10, rays: 13, notch: 0.25, spineCol: '#ffc0a8', rayCol: '#a02a1a', edge: '#8a1a10', edgeW: 0.08, alpha: [0.9, 0.62], ripple: 0.3, px: [128, 36] },
    { type: 'anal', t0: 0.64, t1: 0.84, h: [[0, 0.05], [0.4, 0.07], [1, 0.03]], sweep: 0.45, col: ['#e86a50', '#f08a70'], spines: 3, rays: 8, spineCol: '#ffc0a8', alpha: [0.9, 0.62], ripple: 0.3, px: [64, 28] },
    { type: 'caudal', shape: 'emarginate', len: 0.18, span: 0.13, col: ['#c83a2a', '#e06048', '#f08a70'], edge: '#7a1410', edgeW: 0.1, rays: 16, rayCol: '#a02a1a', alpha: [0.92, 0.65], px: [80, 64] },
    { type: 'pectoral', t: 0.27, y: -0.25, len: 0.14, angle: 18, shape: 'pointed', col: ['#f8a890', '#f08a70'], rays: 12, alpha: [0.7, 0.4], flutter: 0.07, out: 0.6 },
    { type: 'pelvic', t: 0.32, len: 0.08, angle: 55, col: ['#f08a70', '#e86a50'], rays: 6, alpha: [0.85, 0.6], flutter: 0.03 },
  ],
  swim: { k: 0.85, a0: 0.03, pow: 2.4, amp: 0.09, freq: 1.1, freqK: 1.0, flutter: [5, 0.02], ripple: 0.01 },
};

// ------------------------------------------------------------------------------------------- orca
// Killer whale: robust torpedo, blunt head, towering dorsal fin, paddle flippers, horizontal flukes (vertical
// beat). Glossy black with the white eye patch, white chin + belly sweep and a grey saddle.
const orca: FishSpec = {
  name: 'orca', L: 6, body: 0.86, page: [512, 512], bodyH: 256, rings: 56, seg: 32,
  top: [[0, 0.0], [0.01, 0.025], [0.04, 0.05], [0.1, 0.08], [0.2, 0.105], [0.35, 0.118], [0.5, 0.112], [0.66, 0.088], [0.8, 0.055], [0.92, 0.032], [1, 0.026]],
  bot: [[0, 0.0], [0.01, 0.022], [0.04, 0.045], [0.1, 0.075], [0.22, 0.1], [0.38, 0.11], [0.54, 0.1], [0.7, 0.072], [0.84, 0.045], [1, 0.022]],
  wid: [[0, 0.0], [0.01, 0.024], [0.06, 0.06], [0.2, 0.098], [0.4, 0.108], [0.6, 0.09], [0.8, 0.05], [0.95, 0.02], [1, 0.014]],
  sq: [[0, 2.0], [0.7, 2.0], [0.88, 2.6], [1, 3.0]],
  cy: [[0, -0.01], [0.15, 0], [1, 0.004]],
  noseRound: 0.004,
  mouth: { t: 0.085, th: [[0, 0.52], [0.085, 0.6]], open: 0.55, interior: '#c84a58', crease: '#0a0a0e',
    teeth: { upper: 11, lower: 11, size: 0.007, style: 'peg', inset: 0.9, t0: 0.012, t1: 0.075 } },
  eye: { t: 0.105, y: 0.08, r: 0.008, fwd: 0.2, up: 0.05, lid: 'none', bulge: 0.5,
    paint: { iris: ['#100808', '#3a1a10', '#6a3a20', '#a06a40'], pupil: 0.55, ring: '#c09070', sclera: '#e8e0d8', irisR: 0.7 } },
  rough: 0.32, sheen: 0.3, normal: 1,
  paint: (c) => {
    const x = c.t, y = c.yn;
    let col = grad(['#06070a', '#0c0e14', '#14161e', '#1c1e28'])(0.5 - y * 0.3, c.px, c.py);
    const WHITE = grad(['#f8f8f4', '#e8eaea', '#d0d4d8']);
    // white eye patch: an oval above and behind the eye
    const ex = (x - 0.15) * 7.5, ey = (y - 0.32) * 2.8;
    if (Math.hypot(ex, ey) < 1 && Math.abs(c.side) > 0.2) col = WHITE(0.3, c.px, c.py);
    // white chin + throat, sweeping back along the belly, with the flank lobe rising behind the dorsal
    const belly = -0.55 + Math.sin(Math.min(1, x / 0.12) * Math.PI / 2) * -0.0;
    let wl = x < 0.08 ? -0.15 - (0.08 - x) * 0 : -0.45;
    if (x > 0.45 && x < 0.75) wl = -0.45 + Math.sin(((x - 0.45) / 0.3) * Math.PI) * 0.7;
    if (y < wl && x < 0.8) col = WHITE(0.5 + y * 0.2, c.px, c.py);
    if (x < 0.085 && y < 0.0) col = WHITE(0.4, c.px, c.py);
    void belly;
    // grey saddle behind the dorsal fin
    if (y > 0.65 && x > 0.47 && x < 0.62) col = dmix(col, C('#6a6e78'), 0.75, c.px, c.py);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.36, t1: 0.48, h: [[0, 0.06], [0.2, 0.2], [0.45, 0.17], [1, 0.012]], sweep: 0.28, lean: [[0, 0], [0.3, 0.05], [1, 0.4]], col: ['#0c0e14', '#14161e', '#1c1e28'], rays: 0, opaque: true, thick: 0.006, px: [96, 96] },
    { type: 'fluke', len: 0.1, span: 0.13, col: ['#0c0e14', '#14161e', '#1c1e28'], rays: 0, opaque: true, thick: 0.006, px: [96, 48] },
    { type: 'pectoral', t: 0.17, y: -0.75, len: 0.13, baseLen: 0.06, span: 0.55, angle: 42, col: ['#0c0e14', '#14161e', '#1c1e28'], rays: 0, opaque: true, thick: 0.012, out: 0.35, flutter: 0.04, px: [64, 48],
      ext: (u) => 0.7 + 0.3 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)) },
  ],
  swim: { k: 0.55, a0: 0.01, pow: 2.8, amp: 0.06, freq: 0.35, freqK: 0.9, vertical: true, flutter: [1.2, 0.012] },
  clearcoat: 0.55, clearcoatRough: 0.28,
};

// ------------------------------------------------------------------------------------------- sperm whale
// Giant square-fronted head (a third of the body), narrow underslung jaw with peg teeth, wrinkled dark grey
// skin with pale scars, a low hump and knuckles toward the flukes, stubby flippers.
const spermWhale: FishSpec = {
  name: 'sperm_whale', L: 12, body: 0.88, page: [512, 512], bodyH: 256, rings: 60, seg: 32,
  top: [[0, 0.0], [0.003, 0.075], [0.02, 0.098], [0.1, 0.104], [0.24, 0.104], [0.32, 0.096], [0.4, 0.082], [0.55, 0.076], [0.64, 0.072], [0.75, 0.05], [0.88, 0.03], [1, 0.022]],
  bot: [[0, 0.0], [0.003, 0.03], [0.03, 0.045], [0.12, 0.056], [0.22, 0.07], [0.36, 0.088], [0.5, 0.084], [0.66, 0.062], [0.82, 0.035], [1, 0.02]],
  wid: [[0, 0.0], [0.003, 0.05], [0.04, 0.064], [0.2, 0.07], [0.4, 0.078], [0.6, 0.064], [0.8, 0.035], [1, 0.016]],
  sq: [[0, 4.5], [0.22, 3.6], [0.38, 2.3], [1, 2.4]],
  cy: [[0, 0.022], [0.25, 0.016], [0.4, 0], [1, 0]],
  noseRound: 0.003,
  mouth: { t: 0.24, th: [[0, 0.78], [0.04, 0.8], [0.24, 0.7]], open: 0.5, interior: '#e0c8c8', crease: '#1a1814', lipCol: '#d8d0c8', lip: 0.02,
    teeth: { upper: 0, lower: 18, size: 0.006, style: 'peg', inset: 0.8, t0: 0.03, t1: 0.22, col: ['#fffcf0', '#f0e8d0', '#c8b898', '#7a6a58'] } },
  eye: { t: 0.27, y: -0.2, r: 0.005, fwd: 0.1, up: 0.05, lid: 'none', bulge: 0.5,
    paint: { iris: ['#0a0808', '#2a1a10', '#4a3020', '#6a4a30'], pupil: 0.5, sclera: '#c8c0b8', irisR: 0.7 } },
  rough: 0.5, sheen: 0.15, normal: 3,
  scales: { w: 12, h: 3, k: 0.4, rim: 0.12, hi: 0.0, bump: 1.0, tMin: 0.0 },
  paint: (c) => {
    let col = grad(['#24262a', '#2e3034', '#3a3c40', '#4a4c50', '#5a5c60'])(0.45 - c.yn * 0.35, c.px, c.py);
    // wrinkles: wavy horizontal grooves behind the head
    if (c.t > 0.3) { const wv = Math.sin(c.py * 1.7 + Math.sin(c.px * 0.21) * 2.0); if (wv > 0.85) col = shade(col, 0.8); }
    // pale scars + lips
    if (hash2(c.px >> 2, c.py >> 1, 9) < 0.03 && c.t < 0.5) col = mix(col, C('#a8a8a8'), 0.6);
    if (c.t < 0.24 && c.yn < -0.55) col = mix(col, C('#d8d4cc'), 0.7);
    // dorsal knuckles
    if (c.t > 0.66 && c.t < 0.86 && c.yn > 0.85 && (Math.floor(c.t * 60) % 2 === 0)) col = shade(col, 1.15);
    return col;
  },
  fins: [
    { type: 'dorsal', t0: 0.58, t1: 0.68, h: [[0, 0.01], [0.4, 0.026], [1, 0.004]], sweep: 0.6, col: ['#2e3034', '#3a3c40'], rays: 0, opaque: true, thick: 0.006, px: [64, 32] },
    { type: 'fluke', len: 0.09, span: 0.1, col: ['#2e3034', '#3a3c40', '#24262a'], rays: 0, opaque: true, thick: 0.004, px: [96, 48],
      ext: (u) => { const w = Math.abs(2 * u - 1); return 0.25 + 0.75 * Math.pow(w, 0.8); } },
    { type: 'pectoral', t: 0.32, y: -0.7, len: 0.05, baseLen: 0.02, span: 0.5, angle: 35, col: ['#2e3034', '#3a3c40'], rays: 0, opaque: true, thick: 0.004, out: 0.3, flutter: 0.03 },
  ],
  swim: { k: 0.5, a0: 0.008, pow: 3, amp: 0.05, freq: 0.22, freqK: 0.9, vertical: true, flutter: [1, 0.008] },
  clearcoat: 0.4, clearcoatRough: 0.4,
};

export const SPECS: Record<string, FishSpec> = {
  piranha, cichlid, cichlid_blue: cichlidBlue, peacock_bass: peacockBass, napoleon, triggerfish, sardine, barracuda, cleaner_wrasse: cleaner,
  pufferfish, moray, anglerfish, ichthyosaur,
  pumpkinseed, unicornfish, grouper, pike, snapper, orca, sperm_whale: spermWhale,
};
