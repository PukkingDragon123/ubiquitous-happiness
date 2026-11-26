// The home's MAILBOX (v7): Marge's sea-post box, just inside the front door. A rural post box on a driftwood post:
// an arched box of sea-worn teal planks (paint chipped to the wood, algae creeping up the sides, barnacles on the
// roof) with riveted brass hoops and a brass lip, a door hinged at the bottom with Marge's postage stamp painted on
// it (the manatee in her postal cap), MAIL lettered down the side over a red livery stripe, a red swallowtail flag on
// a brass arm, a little brass bell under the lip, a mount board on braces lashed to the post with rope, a SEA POST
// sign nailed to the post, and a sand mound at its foot with stones, a starfish and kelp climbing the post. Low-poly
// (one Soup per material) over ONE hand-painted pixel page (src/world/atlas.ts): every chip, seam, nail and letter is
// placed by rule (no noise), 5-7 tone hue-shifted ramps, matte.
//
//   const mb = new Mailbox(); scene.add(mb.group)      origin = the post's foot on the floor; the door faces +z
//   mb.update(dt, t, parcels, open)                    the flag is up and letters peek out of the ajar door while
//                                                      parcels > 0; open: the door drops open (the mail panel is up)
//   mb.ring()                                          the bell swings (mail arrived, a click)
import * as THREE from 'three';
import { Soup, icosphere, type V3, type V2, type UVR } from '../world/lp';
import { Atlas, type Region } from '../world/atlas';
import { hex, type RGB } from '../gfx/px';
import { retro } from '../gfx/retro';
import { drawText } from '../ui/pixel/font';
import { damp } from '../core/math';

const ramp = (...s: string[]): RGB[] => s.map((c) => hex(c));
const INK = hex('#0b1622');
const TEAL = ramp('#0a2226', '#123a3e', '#1b5455', '#2a706a', '#3f8c7e', '#62ab94', '#93cdb0');
const WOOD = ramp('#24140e', '#3e2618', '#5a3a22', '#7a5432', '#9c7046', '#bc8e5c', '#d8b07c');
const DRIFT = ramp('#2c2628', '#4a4140', '#685d56', '#877a6c', '#a59886', '#c2b69e', '#ddd3bb');
const BRASS = ramp('#2e1606', '#5a3010', '#8c561a', '#b8802c', '#d8a440', '#eec466', '#fae49c');
const VERD = ramp('#163a34', '#2a5e52', '#47866e', '#76b496');
const RED = ramp('#2e0a10', '#5c1418', '#8e2420', '#c03a2a', '#e06440', '#f4986a', '#ffcca0');
const CREAM = ramp('#5a4a3a', '#8e7c64', '#bcac8e', '#ddd0b2', '#f1e8d0', '#fffaec');
const KRAFT = ramp('#3a2210', '#5e3c1e', '#86602e', '#a8823e', '#c8a256', '#e2c47a');
const ROPE = ramp('#1e1309', '#3e2b12', '#644a22', '#8c6e38', '#b49250', '#d6b874', '#efdba4');
const KELP = ramp('#0c200e', '#183a14', '#28561c', '#3c7426', '#559234', '#78b04a', '#a8d06c');
const ALGAE = ramp('#16301a', '#244a22', '#36622a', '#4e7c34');
const STONE = ramp('#1c1e26', '#2e3038', '#45474e', '#5e5f64', '#7a7a7c', '#9a9894', '#bab6ae');
const SAND = ramp('#4a3620', '#6a5232', '#8c7048', '#ae905e', '#caac76', '#e0c690', '#f2deb0');
const BARN = ramp('#1c1a22', '#38353c', '#5c5759', '#837c76', '#aaa196', '#cec6b6', '#efe9dc');
const HIDE = ramp('#2a2a34', '#45464f', '#62636c', '#7f808a', '#9c9da6', '#bebfc6');
const NAVY = ramp('#0a1028', '#16224a', '#22346c', '#34508e');
const STAR = ramp('#4a1410', '#842a1a', '#c04a26', '#e8783a', '#fcae62');

/** a deterministic 0..1 from integers (where a chip / knot / barnacle goes) */
const h = (a: number, b = 0) => { let n = (a * 374761393 + b * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177; return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };

// ------------------------------------------------------------------ painters
/** planks running along x (seams are rows), sea-worn paint over wood with chips, nails at the ends */
function planks(r: Region, w: number, hh: number, o: { pitch: number; paint: RGB[] | null; seed: number; chips: number; nails?: boolean; algae?: number; vertical?: boolean }) {
  const P = o.paint ?? WOOD;
  const along = (x: number, y: number) => (o.vertical ? [y, x] : [x, y]);
  const W = o.vertical ? hh : w, H = o.vertical ? w : hh;
  for (let b = 0; b < H; b++) for (let a = 0; a < W; a++) {
    const k = b % o.pitch, i = Math.floor(b / o.pitch);
    let c: RGB;
    if (k === 0) c = INK;                                         // the seam
    else if (k === 1) c = P[5];                                   // the plank's lit upper edge
    else if (k === o.pitch - 1) c = P[2];                         // its shaded lower edge
    else c = P[(i + o.seed) % 3 === 0 ? 4 : 3];
    // long grain strokes through the paint, broken unevenly
    if (k > 1 && k < o.pitch - 1 && (k + i) % 3 === 0 && ((a + i * 7 + o.seed) % 23) < 15) c = P[(i + o.seed) % 3 === 0 ? 3 : 2];
    // plank ends (butt joints) staggered per plank
    const joint = Math.round(W * (0.3 + 0.4 * h(i, o.seed)));
    if (a === joint && k > 0) c = INK; else if (a === joint + 1 && k > 0) c = P[5];
    const [x, y] = along(a, b);
    r.set(x, y, c);
  }
  // paint chips down to the wood: a recessed patch, dark along its top, lit along its foot, grain inside
  if (o.paint) for (let n = 0; n < o.chips; n++) {
    const cx = Math.floor(h(n, o.seed + 1) * (W - 8)) + 3, i = Math.floor(h(n, o.seed + 2) * Math.floor(H / o.pitch));
    const cy = i * o.pitch + 2, cw = 3 + Math.floor(h(n, o.seed + 3) * 5), ch = Math.min(o.pitch - 3, 2 + Math.floor(h(n, o.seed + 4) * 2));
    for (let b = 0; b < ch; b++) for (let a = 0; a < cw; a++) {
      if ((a === 0 || a === cw - 1) && (b === 0 || b === ch - 1)) continue;
      const [x, y] = along(cx + a + (b === ch - 1 ? 1 : 0), cy + b);
      r.set(x, y, b === 0 ? WOOD[1] : b === ch - 1 ? WOOD[5] : (a + b) % 4 === 0 ? WOOD[3] : WOOD[4]);
    }
  }
  if (o.nails) for (let i = 0; i * o.pitch < H; i++) for (const a of [2, W - 4]) {
    const b = i * o.pitch + Math.floor(o.pitch / 2);
    const s = (x: number, y: number, c: RGB) => { const [X, Y] = along(x, y); r.set(X, Y, c); };
    s(a, b, STONE[1]); s(a + 1, b, STONE[4]); s(a, b + 1, STONE[2]); s(a + 1, b + 1, STONE[1]);
    s(a, b + 2, RED[2]); s(a + 1, b + 3, RED[1]);
  }
  // algae creeping up from the bottom edge: a wavy front with a darker fringe
  if (o.algae) for (let a = 0; a < W; a++) {
    const top = H - o.algae - Math.round(Math.sin(a * 0.45 + o.seed) * 1.5 + Math.sin(a * 0.17) * 1.2);
    for (let b = Math.max(0, top); b < H; b++) {
      const [x, y] = along(a, b);
      r.set(x, y, b === top ? ALGAE[0] : b === top + 1 ? ALGAE[3] : (a + b) % 5 === 0 ? ALGAE[1] : ALGAE[2]);
    }
  }
}

/** pixel text (the classic m5x7) stamped into a region: ink letters with a lit lip below (carved) or a drop shadow */
function letters(r: Region, s: string, x: number, y: number, col: RGB, o: { shadow?: RGB; lip?: RGB } = {}) {
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 16;
  const c = cv.getContext('2d')!;
  drawText(c, s, 0, 2, { font: 'small', color: '#ffffff', shadow: null });
  const d = c.getImageData(0, 0, 96, 16).data;
  const on = (i: number, j: number) => i >= 0 && j >= 0 && i < 96 && j < 16 && d[(j * 96 + i) * 4 + 3] > 128;
  for (let j = 0; j < 16; j++) for (let i = 0; i < 96; i++) {
    if (on(i, j)) continue;
    if (o.shadow && on(i - 1, j - 1)) r.set(x + i, y + j - 2, o.shadow);
    else if (o.lip && on(i, j - 1)) r.set(x + i, y + j - 2, o.lip);
  }
  for (let j = 0; j < 16; j++) for (let i = 0; i < 96; i++) if (on(i, j)) r.set(x + i, y + j - 2, col);
}

/** hand-drawn sprites: rows of palette letters ('.' clear) */
function sprite(r: Region, rows: string[], pal: Record<string, RGB>, x: number, y: number) {
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (c) r.set(x + i, y + j, c); } });
}
/** Marge on her postage stamp: the manatee's round grey face, small eyes, the pale bristly muzzle, her peaked cap */
const MARGE = [
  '....NNNNN....',
  '...NNNYNNN...',
  '..NRRRRRRRN..',
  '..KKKKKKKKK..',
  '.GHHHHHHHHHG.',
  '.HHeHHHHHeHH.',
  'GHHHHHHHHHHHG',
  'GHHMMMMMMMHHG',
  '.HMMwMMMwMMH.',
  '..MMMmmmMMM..',
  '...MMMMMMM...',
];
const MARGE_PAL = (): Record<string, RGB> => ({ N: NAVY[2], Y: BRASS[5], R: RED[3], K: INK, G: HIDE[1], H: HIDE[3], e: INK, M: HIDE[5], w: HIDE[2], m: HIDE[2] });

/** the brass post-horn, the postal emblem (9 x 6) */
const HORN = ['..bbb....', '.b...b..B', 'b.....bBB', 'b.....bBB', '.b...b..B', '..bbb....'];

function paintAll(A: Atlas) {
  const R = {} as Record<string, UVR>;
  // ---- the box: the arched roof (planks along the box), the two sides, the door, its inside, the back
  R.roof = A.paint('roof', 50, 50, (r, w, hh) => {
    planks(r, w, hh, { pitch: 8, paint: TEAL, seed: 3, chips: 9, nails: true });
    // salt bleaching along the crown (the middle rows), barnacles and a limpet near the back
    for (let y = 20; y < 30; y++) for (let x = 0; x < w; x++) if ((x + y) % 7 === 0 && y % 8 > 1) r.set(x, y, TEAL[5]);
    for (const [bx, by] of [[44, 9], [46, 13], [41, 36], [45, 39]]) { r.set(bx, by, BARN[4]); r.set(bx + 1, by, BARN[5]); r.set(bx, by + 1, BARN[3]); r.set(bx + 1, by + 1, INK); r.set(bx + 2, by + 1, BARN[2]); r.set(bx + 1, by + 2, BARN[2]); }
  });
  const side = (name: string, text: boolean) => A.paint(name, 50, 19, (r, w, hh) => {
    planks(r, w, hh, { pitch: 9, paint: TEAL, seed: name.length, chips: 4, algae: 3 });
    // the red livery stripe along the lower plank, a cream pinstripe over it
    for (let x = 0; x < w; x++) { r.set(x, 11, CREAM[3]); for (let y = 12; y < 15; y++) r.set(x, y, y === 12 ? RED[4] : y === 14 ? RED[2] : RED[3]); r.set(x, 15, INK); }
    for (let x = 3; x < w; x += 9) { r.set(x, 13, RED[1]); r.set(x + 1, 13, RED[5]); } // its chipped rivets
    // MAIL between the brass hoops (they cross the side at x 5-9 and 41-45)
    if (text) letters(r, 'MAIL', 14, 2, CREAM[5], { shadow: INK });
  });
  R.sideR = side('sideR', true);
  R.sideL = side('sideL', true);
  R.door = A.paint('door', 32, 36, (r, w, hh) => {
    // the arch: centre (16, 16.5) r 16, the straight sides below it
    const inside = (x: number, y: number) => x >= 0 && x < w && y < hh && (y >= 16.5 ? true : Math.hypot(x + 0.5 - 16, y + 0.5 - 16.5) <= 16);
    const edge = (x: number, y: number) => { let d = 9; for (let k = 1; k <= 3; k++) if (!inside(x - k, y) || !inside(x + k, y) || !inside(x, y - k) || !inside(x, y + k) || y + k >= hh) { d = k; break; } return d; };
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const d = edge(x, y), lit = x < 16 && y < 20;
      let c: RGB;
      if (d === 1) c = BRASS[1];
      else if (d === 2) c = lit ? BRASS[5] : BRASS[3];
      else if (d === 3) c = BRASS[2];
      else {
        const k = (x - 3) % 9;
        c = k === 0 ? TEAL[1] : k === 1 ? TEAL[5] : k === 8 ? TEAL[2] : (y + x * 3) % 13 < 2 ? TEAL[3] : TEAL[4];
      }
      r.set(x, y, c);
    }
    // rivets in the rim
    for (const [x, y] of [[4, 34], [27, 34], [3, 18], [28, 18], [8, 6], [23, 6], [15, 2]]) { r.set(x, y, BRASS[6]); r.set(x + 1, y, BRASS[3]); }
    // Marge's postage stamp: a cream stamp with a perforated edge, a red frame, her face in her postal cap
    const sx = 8, sy = 12, sw = 16, sh = 15;
    for (let y = sy; y < sy + sh; y++) for (let x = sx; x < sx + sw; x++) {
      const e = x === sx || y === sy || x === sx + sw - 1 || y === sy + sh - 1;
      if (e && (x + y) % 2 === 0) continue;                  // the perforations
      r.set(x, y, e ? CREAM[4] : x === sx + 1 || y === sy + 1 || x === sx + sw - 2 || y === sy + sh - 2 ? RED[3] : CREAM[4]);
    }
    for (let x = sx + 1; x < sx + sw; x++) r.set(x, sy + sh, TEAL[1]);
    for (let y = sy + 1; y <= sy + sh; y++) r.set(sx + sw, y, TEAL[1]);
    sprite(r, MARGE, MARGE_PAL(), sx + 2, sy + 2);
    // the latch slot over the stamp
    for (let x = 12; x < 20; x++) { r.set(x, 8, INK); r.set(x, 9, TEAL[5]); }
  });
  R.doorIn = A.paint('doorIn', 16, 16, (r, w, hh) => planks(r, w, hh, { pitch: 5, paint: null, seed: 5, chips: 0, vertical: true }));
  R.back = A.paint('back', 32, 36, (r, w, hh) => {
    planks(r, w, hh, { pitch: 8, paint: TEAL, seed: 9, chips: 5, vertical: true, algae: 4 });
    // the post-horn, the sea post's badge, in brass on the back
    sprite(r, HORN, { b: BRASS[5], B: BRASS[3] }, 11, 16);
  });
  R.edge = A.paint('edge', 8, 8, (r, w, hh) => { for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) r.set(x, y, y === 0 ? TEAL[6] : y === hh - 1 ? TEAL[1] : (x + y) % 4 === 0 ? TEAL[3] : TEAL[4]); });
  R.inside = A.paint('inside', 8, 8, (r, w, hh) => { for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) r.set(x, y, y < 2 ? WOOD[0] : (x + y) % 5 === 0 ? WOOD[1] : INK); });
  R.bottom = A.paint('bottom', 16, 16, (r, w, hh) => planks(r, w, hh, { pitch: 5, paint: null, seed: 2, chips: 0 }));
  // ---- brass: the hoops and lip (an engraved centre line, rivets, verdigris), the flag arm
  R.brass = A.paint('brass', 8, 16, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      let c = x === 0 ? BRASS[1] : x === 1 ? BRASS[5] : x === w - 1 ? BRASS[1] : x === w - 2 ? BRASS[2] : x === 4 ? BRASS[2] : x === 5 ? BRASS[5] : BRASS[4];
      if (y % 8 === 3 && (x === 2 || x === 3)) c = x === 2 ? BRASS[6] : BRASS[2];
      if ((y === 6 || y === 13) && x === 6) c = VERD[2];
      r.set(x, y, c);
    }
  });
  // ---- the post: bleached driftwood (grain lines, knots, a split), wet and algae-grown at its foot, barnacles
  R.post = A.paint('post', 24, 64, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const wave = Math.round(Math.sin(y * 0.11 + x * 0.6) * 0.8);
      const g = (x + wave + 24) % 4;
      let c = g === 0 ? DRIFT[2] : g === 2 ? DRIFT[5] : DRIFT[4];
      if (x % 8 === 7) c = DRIFT[1];                                   // the facet seams in shadow
      if (y > 50) c = y > 56 ? (g === 2 ? DRIFT[3] : DRIFT[2]) : (g === 2 ? DRIFT[4] : DRIFT[3]); // the wet line
      r.set(x, y, c);
    }
    // knots: a dark eye, a lit rim, the grain bending round it
    for (const [kx, ky] of [[5, 14], [17, 31], [9, 42]]) {
      for (let j = -3; j <= 3; j++) for (let i = -2; i <= 2; i++) { const e = (i / 2.5) ** 2 + (j / 3.5) ** 2; if (e <= 1) r.set(kx + i, ky + j, e < 0.3 ? WOOD[1] : e < 0.6 ? WOOD[3] : DRIFT[6]); }
      r.set(kx - 3, ky, DRIFT[1]); r.set(kx + 3, ky, DRIFT[1]);
    }
    // a split down the grain
    for (let y = 20; y < 28; y++) { r.set(12 + (y > 24 ? 1 : 0), y, INK); r.set(13 + (y > 24 ? 1 : 0), y, DRIFT[6]); }
    // the algae band and its fringe, barnacles below it
    for (let x = 0; x < w; x++) { const t = 48 + Math.round(Math.sin(x * 0.7) * 1.4); r.set(x, t, ALGAE[0]); for (let y = t + 1; y < t + 5; y++) r.set(x, y, (x + y) % 3 ? ALGAE[2] : ALGAE[3]); }
    for (const [bx, by] of [[3, 57], [10, 59], [16, 56], [21, 60], [7, 61]]) { r.set(bx, by, BARN[5]); r.set(bx + 1, by, BARN[4]); r.set(bx - 1, by + 1, BARN[3]); r.set(bx, by + 1, INK); r.set(bx + 1, by + 1, BARN[2]); r.set(bx, by + 2, BARN[2]); }
  });
  R.plank = A.paint('plank', 16, 32, (r, w, hh) => planks(r, w, hh, { pitch: 8, paint: null, seed: 7, chips: 0, nails: true, vertical: true }));
  // ---- the SEA POST sign on the post: a driftwood board, carved letters with a lit lip, nails, a barnacle
  R.sign = A.paint('sign', 54, 13, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const e = x === 0 || y === 0 || x === w - 1 || y === hh - 1;
      r.set(x, y, e ? INK : y === 1 ? WOOD[6] : y === hh - 2 ? WOOD[2] : (x + y * 3) % 11 < 2 ? WOOD[4] : WOOD[5]);
    }
    letters(r, 'SEA POST', 5, 4, WOOD[1], { lip: WOOD[6] });
    for (const x of [2, w - 4]) { r.set(x, 5, STONE[1]); r.set(x + 1, 5, STONE[4]); r.set(x, 6, RED[2]); }
    r.set(w - 7, hh - 3, BARN[5]); r.set(w - 6, hh - 3, BARN[3]); r.set(w - 7, hh - 2, INK);
  });
  // ---- the flag: a red swallowtail pennant with a cream wave stripe and a little cream fish
  R.flag = A.paint('flag', 20, 14, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const notch = x > w - 6 && Math.abs(y - hh / 2 + 0.5) < (x - (w - 6)) * 0.9;
      if (notch) continue;
      const e = x === 0 || y === 0 || y === hh - 1 || x === w - 1 || (x > w - 6 && Math.abs(Math.abs(y - hh / 2 + 0.5) - (x - (w - 6)) * 0.9) < 1);
      r.set(x, y, e ? INK : y === 1 ? RED[5] : y === hh - 2 ? RED[2] : y === 9 || y === 10 ? (x % 4 < 2 ? CREAM[4] : CREAM[3]) : RED[3]);
    }
    sprite(r, ['.cc.c', 'cccc.', '.cc.c'], { c: CREAM[5] }, 5, 3);
  });
  // ---- the mail: an airmail envelope (red / blue chevron border, a stamp, address lines), a kraft parcel
  R.letter = A.paint('letter', 20, 14, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      const e = x === 0 || y === 0 || x === w - 1 || y === hh - 1;
      const b = x === 1 || y === 1 || x === w - 2 || y === hh - 2;
      r.set(x, y, e ? CREAM[1] : b ? (((x + y) >> 1) % 3 === 0 ? RED[3] : ((x + y) >> 1) % 3 === 1 ? NAVY[3] : CREAM[4]) : CREAM[4]);
    }
    for (let y = 3; y < 7; y++) for (let x = 14; x < 18; x++) r.set(x, y, y === 3 || x === 14 ? RED[4] : RED[3]);
    for (const [x0, y0, L] of [[4, 7, 8], [4, 9, 6], [4, 11, 9]]) for (let x = x0; x < x0 + L; x++) r.set(x, y0, x % 3 ? CREAM[1] : CREAM[2]);
  });
  R.parcel = A.paint('parcel', 16, 16, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      let c = (x * 2 + y) % 9 === 0 ? KRAFT[2] : KRAFT[3];
      if (y === 0) c = KRAFT[5]; if (x === 0) c = KRAFT[4]; if (y === hh - 1 || x === w - 1) c = KRAFT[1];
      if (x === 7 || x === 8 || y === 7 || y === 8) c = (x + y) % 2 ? ROPE[5] : ROPE[4];
      r.set(x, y, c);
    }
    r.set(7, 7, RED[3]); r.set(8, 7, RED[4]); r.set(7, 8, RED[2]); r.set(8, 8, RED[3]);
  });
  // ---- the foot: stones, sand, a rope, barnacles, kelp, a starfish
  R.stone = A.paint('stone', 16, 16, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const f = (x + y * 2) % 11, c = f < 2 ? STONE[2] : f < 6 ? STONE[3] : f < 9 ? STONE[4] : STONE[5]; r.set(x, y, c); }
    for (const [x, y] of [[3, 3], [10, 9], [6, 12]]) { r.set(x, y, ALGAE[3]); r.set(x + 1, y, ALGAE[2]); r.set(x, y + 1, ALGAE[2]); }
    r.set(12, 3, hex('#b45a7a')); r.set(13, 3, hex('#8a3a5a')); r.set(12, 4, hex('#8a3a5a'));
  });
  R.sand = A.paint('sand', 16, 16, (r, w, hh) => {
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const p = (y + Math.round(Math.sin(x * 0.5) * 1.3) + 16) % 5; r.set(x, y, p === 0 ? SAND[2] : p === 1 ? SAND[5] : SAND[4]); }
  });
  R.rope = A.paint('rope', 8, 16, (r, w, hh) => { for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const s = (x + y) % 4; r.set(x, y, s === 0 ? ROPE[1] : s === 1 ? ROPE[5] : s === 2 ? ROPE[4] : ROPE[3]); } });
  R.barn = A.paint('barn', 8, 8, (r, w, hh) => { for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) r.set(x, y, y >= 6 ? INK : y >= 5 ? BARN[2] : x % 3 === 0 ? BARN[3] : y < 2 ? BARN[4] : BARN[5]); });
  R.kelp = A.paint('kelp', 10, 48, (r, w, hh) => {
    for (let y = 0; y < hh; y++) {
      const half = Math.max(1, Math.round((y < 4 ? y * 0.8 : 4) + Math.sin(y * 0.9) * 0.8 - (y > hh - 8 ? (y - (hh - 8)) * 0.4 : 0)));
      for (let x = 5 - half; x < 5 + half; x++) {
        const e = x === 5 - half || x === 4 + half;
        r.set(x, y, e ? KELP[1] : x === 5 ? KELP[5] : x < 5 ? KELP[4] : (y % 4 === 0 ? KELP[2] : KELP[3]));
      }
    }
  });
  R.star = A.paint('star', 14, 14, (r) => {
    for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
      const dx = x - 6.5, dy = y - 6.5, a = Math.atan2(dy, dx), d = Math.hypot(dx, dy);
      const arm = 2.2 + 4.6 * Math.max(0, Math.cos(2.5 * (a + 1.57)));
      if (d > arm) continue;
      r.set(x, y, d < 1.5 ? STAR[4] : d > arm - 1 ? STAR[1] : (x + y) % 3 === 0 ? STAR[3] : STAR[2]);
    }
  });
  return R;
}

// ------------------------------------------------------------------ geometry helpers
type Q = { a: V3; b: V3; c: V3; d: V3 };
/** a quad with explicit uvs per corner (a, b, c, d), wound a-b-c / a-c-d */
function quadUV(s: Soup, q: Q, ua: V2, ub: V2, uc: V2, ud: V2, k = 1) {
  s.tri(q.a, q.b, q.c, ua, ub, uc, k, k, k);
  s.tri(q.a, q.c, q.d, ua, uc, ud, k, k, k);
}
const lerpUV = (r: UVR, u: number, v: number): V2 => [r.u0 + (r.u1 - r.u0) * u, r.v0 + (r.v1 - r.v0) * v];

/** the box's arched profile (x, y) from the bottom-right, counter-clockwise seen from the front */
function profile(Wd: number, Hs: number, n = 8): [number, number][] {
  const R = Wd / 2, out: [number, number][] = [[R, 0], [R, Hs]];
  for (let i = 1; i < n; i++) { const a = (i / n) * Math.PI; out.push([R * Math.cos(a), Hs + R * Math.sin(a)]); }
  out.push([-R, Hs], [-R, 0]);
  return out;
}

// ------------------------------------------------------------------ the model
const W = 0.4, HS = 0.22, L = 0.62, Y0 = 0.84, ZF = L / 2, ZB = -L / 2;
let shared: { atlas: Atlas; R: Record<string, UVR>; body: THREE.Material; flora: THREE.Material } | null = null;
function materials() {
  if (shared) return shared;
  const atlas = new Atlas(256, 256, false);
  const R = paintAll(atlas);
  const tex = atlas.texture();
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  const body = retro(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }));
  const flora = retro(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide }));
  shared = { atlas, R, body, flora };
  return shared;
}
const mesh = (s: Soup, m: THREE.Material) => { const o = new THREE.Mesh(s.geometry({ sway: false, glow: false }), m); o.castShadow = true; o.receiveShadow = true; return o; };

export class Mailbox {
  group = new THREE.Group();
  /** the door, hinged at its foot (rotation.x opens it outward and down) */
  private door = new THREE.Group();
  /** the flag arm on its pivot (rotation.x = -PI/2 is up) */
  private flag = new THREE.Group();
  private bell = new THREE.Group();
  /** the airmail letters poking out over the ajar door, and a parcel tied on the roof (three parcels and up) */
  private stuff = new THREE.Group();
  private parcel = new THREE.Group();
  private openK = 0; private openV = 0;
  private flagK = 0;
  private bellA = 0; private bellV = 0;
  private lastN = -1;

  constructor() {
    const { R, body, flora } = materials();
    const s = new Soup(), f = new Soup();
    // ---- the foot: a sand mound, stones, barnacles, a starfish
    s.lathe([[0.34, 0.0], [0.3, 0.025], [0.2, 0.05], [0.1, 0.065], [0, 0.07]], 9, R.sand, { jit: (j, k) => 1 + 0.08 * Math.sin(k * 2.3 + j) });
    const ico = icosphere(1);
    for (const [x, z, rr, sy, seed] of [[0.2, 0.12, 0.085, 0.7, 1], [-0.17, 0.15, 0.07, 0.8, 2], [0.1, -0.2, 0.095, 0.6, 3], [-0.22, -0.08, 0.06, 0.75, 4]]) {
      const from = s.count;
      for (let fi = 0; fi < ico.i.length; fi += 3) {
        const P = [0, 1, 2].map((q) => { const v = ico.i[fi + q]; const j = 1 + 0.18 * Math.sin(v * 1.7 + seed); return [ico.p[v * 3] * rr * j, ico.p[v * 3 + 1] * rr * sy * j, ico.p[v * 3 + 2] * rr * j] as V3; });
        const n = [0, 1, 2].map((q) => lerpUV(R.stone, (ico.p[ico.i[fi + q] * 3] + 1) / 2, (ico.p[ico.i[fi + q] * 3 + 1] + 1) / 2));
        const shade = 0.75 + 0.3 * Math.max(0, (P[0][1] + P[1][1] + P[2][1]) / (3 * rr));
        s.tri(P[0], P[1], P[2], n[0], n[1], n[2], shade, shade, shade);
      }
      s.transformSince(from, new THREE.Matrix4().makeTranslation(x, rr * sy * 0.4, z));
    }
    const barnacle = (m: THREE.Matrix4, sc = 1) => { const from = s.count; s.lathe([[0.024 * sc, 0], [0.018 * sc, 0.016 * sc], [0.011 * sc, 0.024 * sc], [0.006 * sc, 0.02 * sc], [0, 0.016 * sc]], 6, R.barn); s.transformSince(from, m); };
    // ---- the post: knobbly driftwood, six-sided, a little lean
    const rings: V3[][] = [];
    const ys = [0, 0.12, 0.3, 0.5, 0.66, Y0 - 0.05];
    ys.forEach((y, j) => {
      const rr = 0.072 - j * 0.003, cx = 0.012 * Math.sin(j * 0.9), cz = -0.01 * j / ys.length;
      rings.push(Soup.ringXZ(cx, y, cz, rr, rr * 0.92, 6, 0.3 + j * 0.12, (k) => 1 + 0.12 * Math.sin(k * 2.1 + j * 1.7)));
    });
    s.loft(rings, R.post, { shade: (j) => 0.8 + 0.04 * j });
    for (const [a, y, sc] of [[0.4, 0.09, 1], [1.5, 0.06, 0.8], [2.6, 0.12, 1.1], [3.9, 0.07, 0.9], [5.1, 0.1, 0.8]]) {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * 0.07, y, Math.sin(a) * 0.07), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0.25, Math.sin(a)).normalize()), new THREE.Vector3(1, 1, 1));
      barnacle(m, sc);
    }
    // rope lashing round the post under the braces (a helix)
    const helix: V3[] = [];
    for (let i = 0; i <= 44; i++) { const a = i * 0.5, y = Y0 - 0.34 + i * 0.0036; helix.push([Math.cos(a) * 0.082, y, Math.sin(a) * 0.08]); }
    s.tube(helix, () => 0.011, 4, R.rope);
    // the braces up to the mount board, and the board
    for (const sgn of [-1, 1]) {
      const from = s.count;
      s.box([-0.022, -0.17, -0.018], [0.044, 0.34, 0.036], R.plank);
      s.transformSince(from, new THREE.Matrix4().compose(new THREE.Vector3(0, Y0 - 0.17, sgn * 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(sgn * 0.78, 0, 0)), new THREE.Vector3(1, 1, 1)));
    }
    s.box([-0.14, Y0 - 0.045, -0.33], [0.28, 0.045, 0.66], R.plank);
    // the SEA POST sign nailed across the post (facing +x: the camera side once the box is turned), its board edge
    const sy0 = 0.4, sy1 = 0.47, sx = 0.083;
    const sw2 = 0.155;
    s.box([sx - 0.016, sy0, -sw2], [0.016, sy1 - sy0, sw2 * 2], R.plank);
    quadUV(s, { a: [sx + 0.001, sy0, sw2], b: [sx + 0.001, sy0, -sw2], c: [sx + 0.001, sy1, -sw2], d: [sx + 0.001, sy1, sw2] }, [R.sign.u0, R.sign.v0], [R.sign.u1, R.sign.v0], [R.sign.u1, R.sign.v1], [R.sign.u0, R.sign.v1]);
    // ---- the box shell
    const pr = profile(W, HS);
    const nSeg = pr.length - 1;
    for (let i = 0; i < nSeg; i++) {
      const [x0, y0] = pr[i], [x1, y1] = pr[i + 1];
      const q: Q = { a: [x0, Y0 + y0, ZF], b: [x0, Y0 + y0, ZB], c: [x1, Y0 + y1, ZB], d: [x1, Y0 + y1, ZF] };
      if (i === 0) quadUV(s, q, lerpUV(R.sideR, 0, 0), lerpUV(R.sideR, 1, 0), lerpUV(R.sideR, 1, 1), lerpUV(R.sideR, 0, 1));
      else if (i === nSeg - 1) quadUV(s, q, lerpUV(R.sideL, 1, 1), lerpUV(R.sideL, 0, 1), lerpUV(R.sideL, 0, 0), lerpUV(R.sideL, 1, 0), 0.9);
      else {
        const v0 = (i - 1) / (nSeg - 2), v1 = i / (nSeg - 2);
        // the crown catches the light from above; the shoulders a little less
        const k = 0.86 + 0.14 * Math.sin(((i - 0.5) / (nSeg - 2)) * Math.PI);
        quadUV(s, q, lerpUV(R.roof, 0, v0), lerpUV(R.roof, 1, v0), lerpUV(R.roof, 1, v1), lerpUV(R.roof, 0, v1), k);
      }
    }
    // the bottom, the back cap, the dark mouth behind the door
    s.quad([W / 2, Y0, ZF], [-W / 2, Y0, ZF], [-W / 2, Y0, ZB], [W / 2, Y0, ZB], R.bottom, [0.6, 0.6, 0.6, 0.6]);
    const cy = HS * 0.8;
    for (let i = 0; i < pr.length; i++) {
      const p = pr[i], q = pr[(i + 1) % pr.length];
      const uv = (x: number, y: number) => lerpUV(R.back, 1 - (x + W / 2) / W, y / (HS + W / 2));
      s.tri([0, Y0 + cy, ZB], [q[0], Y0 + q[1], ZB], [p[0], Y0 + p[1], ZB], uv(0, cy), uv(q[0], q[1]), uv(p[0], p[1]), 0.85, 0.85, 0.85);
      const ui = (x: number, y: number) => lerpUV(R.inside, (x + W / 2) / W, y / (HS + W / 2));
      s.tri([0, Y0 + cy, ZF - 0.03], [p[0] * 0.96, Y0 + p[1] * 0.96 + 0.005, ZF - 0.03], [q[0] * 0.96, Y0 + q[1] * 0.96 + 0.005, ZF - 0.03], ui(0, cy), ui(p[0], p[1]), ui(q[0], q[1]), 0.5, 0.5, 0.5);
    }
    // brass hoops round the box and the rolled lip at its mouth: a raised strip with its edges
    const hoop = (z0: number, z1: number, out: number) => {
      for (let i = 0; i < nSeg; i++) {
        const [x0, y0] = pr[i], [x1, y1] = pr[i + 1];
        const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = dy / l, ny = -dx / l;
        const A: V3 = [x0 + nx * out, Y0 + y0 + ny * out, z1], B: V3 = [x0 + nx * out, Y0 + y0 + ny * out, z0], C: V3 = [x1 + nx * out, Y0 + y1 + ny * out, z0], D: V3 = [x1 + nx * out, Y0 + y1 + ny * out, z1];
        const lit = i > 0 && i < nSeg - 1 ? 1 : 0.9;
        quadUV(s, { a: A, b: B, c: C, d: D }, [R.brass.u0, R.brass.v0], [R.brass.u1, R.brass.v0], [R.brass.u1, R.brass.v1], [R.brass.u0, R.brass.v1], lit);
        // the strip's front and back edges
        quadUV(s, { a: [x0, Y0 + y0, z1], b: [x0 + nx * out, Y0 + y0 + ny * out, z1], c: [x1 + nx * out, Y0 + y1 + ny * out, z1], d: [x1, Y0 + y1, z1] }, [R.brass.u0, R.brass.v0], [R.brass.u0 + 0.004, R.brass.v0], [R.brass.u0 + 0.004, R.brass.v1], [R.brass.u0, R.brass.v1], 0.8);
        quadUV(s, { a: [x1, Y0 + y1, z0], b: [x1 + nx * out, Y0 + y1 + ny * out, z0], c: [x0 + nx * out, Y0 + y0 + ny * out, z0], d: [x0, Y0 + y0, z0] }, [R.brass.u0, R.brass.v0], [R.brass.u0 + 0.004, R.brass.v0], [R.brass.u0 + 0.004, R.brass.v1], [R.brass.u0, R.brass.v1], 0.7);
      }
    };
    hoop(-0.24, -0.2, 0.009); hoop(0.2, 0.24, 0.009); hoop(ZF - 0.03, ZF, 0.013);
    // barnacles on the roof near the back, a limpet-ish cluster on the shoulder
    for (const [a, z, sc] of [[1.2, -0.25, 0.9], [1.35, -0.27, 0.7], [0.5, -0.27, 0.8], [2.4, -0.26, 0.75]]) {
      const p = new THREE.Vector3((W / 2) * Math.cos(a), Y0 + HS + (W / 2) * Math.sin(a), z);
      barnacle(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), Math.sin(a), 0)), new THREE.Vector3(1, 1, 1)), sc);
    }
    // ---- the kelp climbing the post, a frond draped over the roof's back corner, the starfish on the sand
    f.ribbon([[0.1, 0.05, 0.05], [0.11, 0.2, 0.07], [0.085, 0.38, 0.06], [0.1, 0.55, 0.03], [0.08, 0.66, 0.05]], (t) => 0.06 * (1 - t * 0.5), R.kelp, { side: [0, 0, 1], ruffle: 0.25 });
    f.ribbon([[-0.08, 0.05, -0.08], [-0.1, 0.18, -0.1], [-0.085, 0.3, -0.07]], (t) => 0.05 * (1 - t * 0.6), R.kelp, { side: [1, 0, 1], ruffle: 0.3 });
    f.ribbon([[-0.12, Y0 + HS + 0.17, -0.2], [-0.19, Y0 + HS + 0.08, -0.22], [-0.215, Y0 + 0.16, -0.25], [-0.225, Y0 + 0.02, -0.24]], (t) => 0.05 * (1 - t * 0.5), R.kelp, { side: [0, 0, 1], ruffle: 0.2 });
    f.quad([0.06, 0.068, 0.3], [0.2, 0.06, 0.26], [0.17, 0.062, 0.14], [0.03, 0.07, 0.18], R.star);
    const bodyM = mesh(s, body), floraM = mesh(f, flora);
    floraM.castShadow = false;
    this.group.add(bodyM, floraM);
    // ---- the door: the arch slab hinged at its foot, the latch tab at its top
    const d = new Soup(), T = 0.024, dp = profile(W * 1.04, HS);
    const top = HS + W * 0.52;
    const du = (x: number, y: number) => lerpUV(R.door, (x + W * 0.52) / (W * 1.04), y / top);
    for (let i = 0; i < dp.length; i++) {
      const p = dp[i], q = dp[(i + 1) % dp.length];
      d.tri([0, cy, T], [p[0], p[1], T], [q[0], q[1], T], du(0, cy), du(p[0], p[1]), du(q[0], q[1]));
      const di = (x: number, y: number) => lerpUV(R.doorIn, (x + W / 2) / W, y / top);
      d.tri([0, cy, 0], [q[0], q[1], 0], [p[0], p[1], 0], di(0, cy), di(q[0], q[1]), di(p[0], p[1]), 0.7, 0.7, 0.7);
      quadUV(d, { a: [p[0], p[1], T], b: [p[0], p[1], 0], c: [q[0], q[1], 0], d: [q[0], q[1], T] }, [R.edge.u0, R.edge.v1], [R.edge.u0, R.edge.v0], [R.edge.u1, R.edge.v0], [R.edge.u1, R.edge.v1], 0.85);
    }
    d.box([-0.035, top - 0.04, T], [0.07, 0.03, 0.022], R.brass);
    d.box([-0.012, top - 0.07, T + 0.014], [0.024, 0.032, 0.012], R.brass);
    this.door.add(mesh(d, body));
    this.door.position.set(0, Y0 + 0.002, ZF);
    this.group.add(this.door);
    // ---- the mail: two airmail letters leaning out over the ajar door, a parcel tied on the roof with twine
    const m = new Soup();
    const env = (x: number, y: number, z: number, rx: number, rz: number, sc = 1) => { const from = m.count; m.box([-0.08 * sc, -0.055 * sc, -0.003], [0.16 * sc, 0.11 * sc, 0.006], R.letter); m.transformSince(from, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1))); };
    env(-0.06, Y0 + 0.33, ZF + 0.01, 0.55, 0.16);
    env(0.07, Y0 + 0.3, ZF + 0.025, 0.72, -0.22, 0.9);
    this.stuff.add(mesh(m, body));
    this.stuff.visible = false;
    this.group.add(this.stuff);
    const pc = new Soup();
    pc.box([-0.1, 0, -0.08], [0.2, 0.12, 0.16], R.parcel);
    for (const sx of [-1, 1]) pc.tube([[sx * 0.03, 0.12, -0.08], [sx * 0.03, 0.135, 0], [sx * 0.03, 0.12, 0.08]], () => 0.006, 3, R.rope);
    this.parcel.add(mesh(pc, body));
    this.parcel.position.set(-0.03, Y0 + HS + W / 2 - 0.005, -0.06); this.parcel.rotation.set(0, 0.35, 0.05);
    this.parcel.visible = false;
    this.group.add(this.parcel);
    // ---- the flag on its brass arm (pivot on the right side, near the back)
    const fl = new Soup(), fq = new Soup();
    fl.box([-0.006, -0.014, -0.03], [0.012, 0.028, 0.33], R.brass);
    // the pivot rivet: a domed brass head facing out of the side (+x)
    const rv = fl.count;
    fl.lathe([[0.02, 0], [0.022, 0.008], [0.016, 0.018], [0, 0.021]], 6, R.brass);
    fl.transformSince(rv, new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
    fq.quad([0.004, 0.0, 0.3], [0.004, 0.0, 0.17], [0.004, 0.1, 0.17], [0.004, 0.1, 0.3], R.flag);
    this.flag.add(mesh(fl, body), mesh(fq, flora));
    this.flag.position.set(W / 2 + 0.014, Y0 + 0.11, ZB + 0.12);
    this.group.add(this.flag);
    // ---- the little brass bell under the lip (front right), on a hook
    const b = new Soup();
    b.lathe([[0.042, -0.09], [0.04, -0.078], [0.027, -0.04], [0.016, -0.012], [0.006, 0], [0, 0.004]], 7, R.brass);
    b.tube([[0, 0.002, 0], [0, 0.05, 0]], () => 0.005, 4, R.brass);
    b.lathe([[0.012, -0.1], [0.012, -0.088], [0, -0.084]], 5, R.edge);
    this.bell.add(mesh(b, body));
    this.bell.position.set(W / 2 - 0.05, Y0 - 0.05, ZF - 0.07);
    this.group.add(this.bell);
    this.group.traverse((o) => { o.userData.mailbox = true; });
  }

  /** the bell swings (mail arrived, a click) */
  ring(k = 1) { this.bellV += 7 * k; }

  /** per frame: parcels waiting -> the flag up, the door ajar with letters (and a parcel) poking out; open: dropped */
  update(dt: number, t: number, parcels: number, open: boolean) {
    if (this.lastN >= 0 && parcels > this.lastN) this.ring(1.2);
    this.lastN = parcels;
    const has = parcels > 0;
    // the door: a damped spring toward its angle (a little bounce when it drops open)
    const goal = open ? 1.38 : has ? 0.3 + 0.03 * Math.sin(t * 1.7) : 0;
    this.openV += ((goal - this.openK) * 70 - this.openV * 9) * dt;
    this.openK += this.openV * dt;
    this.door.rotation.x = this.openK;
    // the flag rises (with a wobble) while there is mail, its pennant fluttering in the current
    this.flagK = damp(this.flagK, has ? 1 : 0, 5, dt);
    this.flag.rotation.x = -this.flagK * Math.PI / 2 + Math.sin(t * 2.3) * 0.04 * this.flagK;
    // the bell: a pendulum that settles
    this.bellV += (-this.bellA * 40 - this.bellV * 2.4) * dt;
    this.bellA += this.bellV * dt;
    this.bell.rotation.x = this.bellA * 0.35; this.bell.rotation.z = this.bellA * 0.18;
    // the letters while there is mail (or the door is down), the parcel on the roof from three parcels up
    this.stuff.visible = has || this.openK > 0.1;
    this.parcel.visible = parcels >= 3;
  }
}
