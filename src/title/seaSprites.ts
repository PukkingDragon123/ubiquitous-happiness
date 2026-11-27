// Little hand-shaded sea sprites for the title's pixel art (v8: they replace the 2D pixel blobfish; the only blobfish
// on the title is the real 3D one swimming in the scene). 1 texel per UI px, cached, lit from the top left, clean
// bands of hand-picked ramps, ink outlines.
//
//   pearlClam({ open?, glint? })  the menu cursor: an open scallop on its side with a pearl in it (open: 0..1, the lid
//                                 lifts to puff a bubble; glint: a star of light on the pearl)
//   hermitCrab(frame)             a hermit crab in a whelk shell, facing right: frame 0 / 1 walk, 2 = waving its claw
//   jelly(phase)                  a moon jelly (phase 0..3: the bell's pulse), for the logo's porthole
import { Px, hx, type C } from '../ui/pixel/decor';

const rampC = (...s: string[]) => s.map(hx);
const INK = hx('#120614');
/** scallop shell: plum shadow -> coral -> peach light (7) */
const SHELL = rampC('#3a1020', '#6e2232', '#a8403e', '#d86a4e', '#f09a6a', '#fcc890', '#fff0d0');
/** nacre: violet shadow -> pearl white (6) */
const NACRE = rampC('#3e3058', '#6a5a8a', '#9a8cba', '#c8bee0', '#ece6f8', '#ffffff');
/** whelk shell: brown -> cream (7) */
const WHELK = rampC('#2a1408', '#5a2e12', '#8a4e1e', '#b8782e', '#dca04a', '#f4c876', '#fff0c0');
/** crab: deep red -> orange (6) */
const CRAB = rampC('#2a0806', '#5e140e', '#9a2a18', '#d04a26', '#f27a3a', '#ffb070');
/** moon jelly: lilac -> pink-white (6) */
const JELLY = rampC('#3a1a4a', '#6a3a7a', '#a46aa8', '#d89ccc', '#f4ccea', '#fff2fc');

const cache = new Map<string, HTMLCanvasElement>();
const inE = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
function outline(px: Px, W: number, H: number, inside: (x: number, y: number) => boolean) {
  for (let y = -1; y <= H; y++) for (let x = -1; x <= W; x++) {
    if (inside(x, y)) continue;
    if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) px.set(x + 1, y + 1, INK);
  }
}

/** the menu cursor (26 x 19 with its outline): an open scallop, the pearl resting in its lower valve */
export function pearlClam(o: { open?: number; glint?: boolean } = {}): HTMLCanvasElement {
  const open = Math.round((o.open ?? 0) * 2);
  const key = `clam|${open}|${o.glint ? 1 : 0}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 24, H = 17, px = new Px(W + 2, H + 2);
  const hx0 = 12, hy0 = 16.5; // the hinge (bottom centre)
  // lower valve: a fan from the hinge, its rim scalloped by the ribs; the lid: a smaller fan tilted back above it
  const rib = (x: number, y: number, cx: number, cy: number) => Math.atan2(x + 0.5 - cx, cy - (y + 0.5));
  const lower = (x: number, y: number) => {
    if (y < 8) return false;
    const a = rib(x, y, hx0, hy0), r = Math.hypot(x + 0.5 - hx0, (y + 0.5 - hy0) * 1.25);
    if (Math.abs(a) > 1.38) return false;
    return r < 11.2 + Math.cos(a * 9) * 0.7 && (y + 0.5) > hy0 - 9 + Math.abs(a) * 0.6;
  };
  const lidY = 7 - open;
  const lid = (x: number, y: number) => inE(x, y, hx0, lidY, 10.5, 4.6 + open * 0.4) && y + 0.5 < lidY + 1.2 + Math.abs(x + 0.5 - hx0) * 0.18;
  const ear = (x: number, y: number) => y >= 14 && y <= 16 && x >= 9 && x <= 14;
  const pearl = (x: number, y: number) => inE(x, y, hx0, 10.2 - open * 0.3, 3.7, 3.5);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (lower(x, y) || lid(x, y) || ear(x, y) || pearl(x, y));
  outline(px, W, H, inside);
  const L = [-0.62, -0.78];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    let c: C;
    if (pearl(x, y)) {
      // the pearl: a lilac-white sphere, lit top left, a crisp highlight
      const ex = (x + 0.5 - hx0) / 3.7, ey = (y + 0.5 - (10.2 - open * 0.3)) / 3.5, nz = Math.sqrt(Math.max(0, 1 - ex * ex - ey * ey));
      const d = ex * L[0] + ey * L[1] + nz * 0.5;
      c = NACRE[d > 0.85 ? 5 : d > 0.55 ? 4 : d > 0.2 ? 3 : d > -0.2 ? 2 : 1];
      // a dark rim where it sits against the shell, so it reads as a ball in the cup
      if (!pearl(x, y + 1) || !pearl(x + 1, y) || (!pearl(x - 1, y) && y > 9) ) c = NACRE[0];
    } else if (lid(x, y)) {
      // the lid's inside: nacre, darker toward the hinge side, a shell rim along its top edge
      const rim = !lid(x, y - 1) || !lid(x, y - 2);
      if (rim) c = SHELL[(x + Math.floor(open)) % 3 === 0 ? 3 : 4];
      else c = NACRE[y + 0.5 > lidY ? 1 : 2];
    } else if (ear(x, y) && !lower(x, y)) c = SHELL[2];
    else {
      // the lower valve: ribs radiating from the hinge in two clean tones, a lit upper rim, the nacre lip at the mouth
      const a = rib(x, y, hx0, hy0);
      const band = Math.floor((a + 1.4) * 9 / Math.PI * 1.0) % 2;
      const lip = !lower(x, y - 1) && y < 12;
      c = lip ? NACRE[3] : SHELL[band ? 3 : 4];
      if (!lip && (y > 13 || !inside(x + 1, y + 1))) c = SHELL[band ? 2 : 3];
      if (!lip && !inside(x, y - 1) && x < hx0) c = SHELL[5];
    }
    px.set(x + 1, y + 1, c);
  }
  // the pearl's sparkle
  const py = Math.round(10.2 - open * 0.3);
  px.set(hx0 - 1 + 1, py - 2 + 1, hx('#ffffff'));
  if (o.glint) for (const [dx, dy] of [[0, -4], [0, -5], [-4, -1], [-5, -1], [3, -4]] as [number, number][]) px.set(hx0 - 1 + dx + 1, py + dy + 1, hx('#ffffff'), 220);
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}

/** a hermit crab (facing right, 20 x 15 with its outline) in a whelk shell: frame 0 / 1 = the legs stepping, 2 = the big
 *  claw raised and waving */
export function hermitCrab(frame: 0 | 1 | 2): HTMLCanvasElement {
  const key = `crab|${frame}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 18, H = 13, px = new Px(W + 2, H + 2);
  // the whelk: a fat spiral cone lying on its side, apex to the left
  const shell = (x: number, y: number) => inE(x, y, 7.5, 6.2, 6.6, 5) || (inE(x, y, 3, 5.5, 3.4, 2.6) && x < 5);
  const body = (x: number, y: number) => inE(x, y, 13, 8.6, 3.2, 2.4);
  const claw = (x: number, y: number) => frame === 2 ? inE(x, y, 15.5, 3.2, 2, 1.8) || (x === 14 && y >= 4 && y <= 6) : inE(x, y, 16.2, 8.4, 1.8, 1.6);
  const eyes = (x: number, y: number) => (x === 13 || x === 15) && y >= 4 && y <= 6 && !(frame === 2 && x === 15);
  const legs = (x: number, y: number) => {
    if (y < 10 || y > 12) return false;
    const off = frame === 1 ? 1 : 0;
    return [10 + off, 12 - off, 14 + off].some((lx) => x === lx + (y === 12 ? (lx % 2 ? 1 : -1) : 0));
  };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (shell(x, y) || body(x, y) || claw(x, y) || eyes(x, y) || legs(x, y));
  outline(px, W, H, inside);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) continue;
    let c: C;
    if (shell(x, y)) {
      // whorls: bands that wind toward the apex, lit from above
      const a = Math.atan2(y + 0.5 - 6.2, x + 0.5 - 7.5), r = Math.hypot(x + 0.5 - 7.5, (y + 0.5 - 6.2) * 1.3);
      const whorl = Math.floor(r * 0.55 + a * 0.32 + 8) % 2;
      const lit = y < 4 ? 2 : y < 7 ? 1 : 0;
      c = WHELK[Math.min(6, 2 + lit + whorl * 1)];
      if (!shell(x, y + 1)) c = WHELK[1];
      if (inE(x, y, 11.6, 7.8, 1.8, 2.4)) c = WHELK[0]; // the aperture
    } else if (eyes(x, y)) c = y === 4 ? INK : CRAB[3];
    else if (claw(x, y)) c = CRAB[!claw(x, y - 1) ? 5 : 4];
    else if (legs(x, y)) c = CRAB[y === 12 ? 2 : 3];
    else c = CRAB[!body(x, y - 1) ? 4 : 3];
    px.set(x + 1, y + 1, c);
  }
  px.set(7, 2, WHELK[6]); px.set(8, 2, WHELK[6]); px.set(5, 3, WHELK[5]); // sheen on the shell
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}

/** a small moon jelly (13 x 15 with its outline): phase 0..3 squeezes the bell and swings the tentacles */
export function jelly(phase: number): HTMLCanvasElement {
  const ph = ((Math.floor(phase) % 4) + 4) % 4;
  const key = `jelly|${ph}`;
  const hit = cache.get(key); if (hit) return hit;
  const W = 11, H = 13, px = new Px(W + 2, H + 2);
  const sq = [0, 0.6, 1, 0.5][ph];
  const bell = (x: number, y: number) => y <= 5 && inE(x, y, 5.5, 5.4, 5 - sq * 0.8, 4.6 + sq * 0.5);
  const tent = (x: number, y: number) => {
    if (y < 6 || y > 12) return false;
    for (const [bx, k] of [[2, 0], [5, 1], [8, 2]] as [number, number][]) {
      const sway = Math.round(Math.sin((y - 6) * 0.9 + ph * 1.57 + k) * 0.9);
      if (x === bx + sway + (bx < 5 ? Math.round(sq) : bx > 5 ? -Math.round(sq) : 0) && (y < 12 || k === 1)) return true;
    }
    return false;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (bell(x, y)) {
      const rim = !bell(x, y + 1) || !bell(x - 1, y) || !bell(x + 1, y) || !bell(x, y - 1);
      const gonad = inE(x, y, 5.5, 3.6, 2, 1.3) && !(x === 5 && y === 3);
      px.set(x + 1, y + 1, rim ? JELLY[2] : gonad ? JELLY[3] : y < 3 ? JELLY[5] : JELLY[4], rim ? 255 : 200);
    } else if (tent(x, y)) px.set(x + 1, y + 1, JELLY[y > 9 ? 2 : 3], y > 10 ? 150 : 220);
  }
  px.set(3, 2, hx('#ffffff'));
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}
