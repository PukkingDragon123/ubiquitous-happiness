// Little 2D blobfish sprites for the title's pixel art (1 texel per UI px, cached): the menu's selection cursor and
// the tiny fellow peering out of the logo's porthole. Built from three hand-placed shapes (the jelly head, the droopy
// nose bulb, a fan tail) shaded in clean bands of the blobfish flesh ramp, lit from the top-left, with the eye, the
// glum mouth, the nose crease, the pectoral fin and the highlights placed by hand.
//
//   blobSprite('big' | 'small', { blink?, puff? })   -> canvas facing right (draw it flipped to face left)
import { Px, hx, type C } from '../ui/pixel/decor';

const rampC = (...s: string[]) => s.map(hx);
/** blobfish flesh, plum shadows -> peach lights (7) */
export const FLESH = rampC('#2a0b24', '#5e1a3c', '#93304f', '#c94f66', '#e9767c', '#ffa594', '#ffd6bc');
const INK = hx('#120614');
const EYE = hx('#100810');

interface Spec { W: number; H: number; head: [number, number, number, number]; body: [number, number, number, number]; nose: [number, number, number, number]; tail: [number, number, number]; fin: [number, number, number, number]; eye: [number, number]; mouth: [number, number][]; spec: [number, number][]; brow: [number, number] }
const SPECS: Record<'big' | 'small', Spec> = {
  // the menu cursor: 25 x 18. A big jelly head in front, the body tapering back to a fan tail, the famous droopy nose
  // hanging low over a wide frown
  big: {
    W: 25, H: 18,
    head: [14.5, 8, 7.6, 6.6], body: [8.6, 9, 5.6, 4.2], nose: [20.6, 11.6, 3.5, 3.9], tail: [3.6, 9, 3.6], fin: [11, 12.4, 2.8, 1.5],
    eye: [17, 5], mouth: [[11, 14], [12, 13], [13, 13], [14, 13], [15, 13], [16, 13]], spec: [[10, 3], [11, 3], [12, 2], [13, 2]], brow: [16, 4],
  },
  // the porthole fellow: 14 x 10
  small: {
    W: 14, H: 10,
    head: [8, 4.6, 4.3, 3.7], body: [4.6, 5, 2.9, 2.3], nose: [11.4, 6, 1.9, 2.3], tail: [1.8, 5, 1.8], fin: [6, 7, 1.4, 0.8],
    eye: [9, 3], mouth: [[7, 7], [8, 8], [9, 8]], spec: [[5, 2], [6, 1]], brow: [8, 2],
  },
};

const cache = new Map<string, HTMLCanvasElement>();
/** a blobfish facing right (blink: the eye shut; puff: cheeks blown out, about to blow a bubble) */
export function blobSprite(size: 'big' | 'small', o: { blink?: boolean; puff?: boolean } = {}): HTMLCanvasElement {
  const key = `${size}|${o.blink ? 1 : 0}|${o.puff ? 1 : 0}`;
  const hit = cache.get(key); if (hit) return hit;
  const s = SPECS[size];
  const P = 1; // outline pad
  const W = s.W + 2 * P, H = s.H + 2 * P;
  const px = new Px(W, H);
  const [hx0, hy0, hrx, hry0] = s.head, hry = hry0 + (o.puff ? 0.7 : 0);
  const [bx, by, brx, bry] = s.body;
  const [nx, ny, nrx, nry] = s.nose;
  const inE = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const head = (x: number, y: number) => inE(x, y, hx0, hy0, hrx, hry);
  const body = (x: number, y: number) => head(x, y) || inE(x, y, bx, by, brx, bry);
  const nose = (x: number, y: number) => inE(x, y, nx, ny, nrx, nry);
  const [tx, ty, tr] = s.tail;
  // a fan tail: wider the further out it reaches, with a notch in the middle of its trailing edge
  const tail = (x: number, y: number) => { const u = tx - (x + 0.5); if (u < -1 || u > tr) return false; const half = 0.8 + Math.max(0, u) * (size === 'big' ? 1.05 : 0.9); return Math.abs(y + 0.5 - ty) <= half && !(u > tr - 1.2 && Math.abs(y + 0.5 - ty) < 0.8); };
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < s.W && y < s.H && (body(x, y) || nose(x, y) || tail(x, y));
  // outline (4-neighbour: rounder on a small sprite)
  for (let y = -1; y <= s.H; y++) for (let x = -1; x <= s.W; x++) {
    if (inside(x, y)) continue;
    if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) px.set(x + P, y + P, INK);
  }
  // shading: a pseudo normal from whichever lobe the pixel belongs to, light from the top-left, clean bands
  const L = [-0.62, -0.78];
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    if (!inside(x, y)) continue;
    let t: number;
    if (tail(x, y) && !body(x, y)) {
      t = y + 0.5 < ty ? 4 : 3;
      if (Math.abs(y + 0.5 - ty) > 0.9 && (y % 2 === 0)) t -= 2; // fin rays fanning out
    } else {
      const n: [number, number, number, number] = nose(x, y) && (!head(x, y) || x + 0.5 > hx0 + hrx * 0.62) ? s.nose : head(x, y) ? [hx0, hy0, hrx, hry] : s.body;
      const ex = (x + 0.5 - n[0]) / n[2], ey = (y + 0.5 - n[1]) / n[3];
      const r = Math.min(1, Math.hypot(ex, ey));
      const nz = Math.sqrt(Math.max(0, 1 - r * r));
      const d = ex * L[0] + ey * L[1] + nz * 0.45;
      t = d > 0.78 ? 5 : d > 0.5 ? 4 : d > 0.18 ? 3 : d > -0.2 ? 2 : 1;
    }
    // the bottom / right rim sits in shade
    if (!inside(x, y + 1) || !inside(x + 1, y)) t = Math.min(t, 2);
    if (!inside(x, y + 1) && !inside(x + 1, y + 1)) t = 1;
    px.set(x + P, y + P, FLESH[t]);
  }
  // the crease where the nose bulb hangs off the face (upper-left rim of the nose, inside the body)
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    if (!nose(x, y)) continue;
    if ((!nose(x - 1, y) && head(x - 1, y)) || (!nose(x, y - 1) && head(x, y - 1))) px.set(x + P, y + P, FLESH[2]);
  }
  // the pectoral fin: a small darker lobe with a lit top edge
  const [fx, fy, frx, fry] = s.fin;
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    if (!inE(x, y, fx, fy, frx, fry) || !inside(x, y)) continue;
    px.set(x + P, y + P, inE(x, y - 1, fx, fy, frx, fry) ? FLESH[2] : FLESH[4]);
  }
  // eye: a small dark bead with a glint, a heavy lid over it (the famous glum look)
  const [ex0, ey0] = s.eye;
  if (o.blink) { px.set(ex0 + P, ey0 + 1 + P, FLESH[1]); px.set(ex0 + 1 + P, ey0 + 1 + P, FLESH[1]); if (size === 'big') px.set(ex0 - 1 + P, ey0 + 1 + P, FLESH[2]); }
  else if (size === 'big') {
    px.set(ex0 + P, ey0 + P, EYE); px.set(ex0 + 1 + P, ey0 + P, EYE); px.set(ex0 + P, ey0 + 1 + P, EYE); px.set(ex0 + 1 + P, ey0 + 1 + P, EYE);
    px.set(ex0 + P, ey0 + P, hx('#f4f0ff'));
    px.set(ex0 + 2 + P, ey0 + 1 + P, FLESH[2]);
  } else { px.set(ex0 + P, ey0 + P, EYE); }
  const [bwx, bwy] = s.brow;
  px.set(bwx + P, bwy + P, FLESH[2]); px.set(bwx + 1 + P, bwy + P, FLESH[2]); if (size === 'big') px.set(bwx + 2 + P, bwy + P, FLESH[3]);
  // the glum mouth under the nose
  for (const [mx, my] of s.mouth) if (inside(mx, my)) { px.set(mx + P, my + P, o.puff ? FLESH[2] : FLESH[0]); if (size === 'big' && inside(mx, my + 1) && !s.mouth.some(([a, b]) => a === mx && b === my + 1)) px.set(mx + P, my + 1 + P, FLESH[3]); }
  if (o.puff && size === 'big') { px.set(s.mouth[s.mouth.length - 1][0] + 1 + P, s.mouth[s.mouth.length - 1][1] - 1 + P, FLESH[0]); }
  // highlights on the dome
  for (const [sx, sy] of s.spec) if (inside(sx, sy)) px.set(sx + P, sy + P, FLESH[6]);
  if (size === 'big') px.set(Math.round(nx - 1) + P, Math.round(ny - nry + 1) + P, FLESH[6]);
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}

/** a little air bubble ring the blobfish blows (r 2..4): an ink-free glassy ring, lit top-left (cached) */
export function ringBubble(r: number): HTMLCanvasElement {
  const key = 'ring|' + r;
  const hit = cache.get(key); if (hit) return hit;
  const S = r * 2 + 1, px = new Px(S, S);
  const lit: C = hx('#e6fbff'), mid: C = hx('#8fd0dc'), dk: C = hx('#4a90a8');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - r, y - r);
    if (d > r + 0.4) continue;
    if (d > r - 0.7) px.set(x, y, x + y < S - 1 ? lit : x + y > S ? dk : mid, 230);
    else px.set(x, y, mid, 40);
  }
  px.set(Math.round(r * 0.55), Math.round(r * 0.55), hx('#ffffff'));
  const cv = px.done();
  cache.set(key, cv);
  return cv;
}
