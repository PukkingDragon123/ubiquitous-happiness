// Paints a fisherman's whole texture page from his Look: the face (weathered skin, blush, sunburn, wrinkles,
// stubble, freckles, scars), hair and beard strands, every garment (cable-knit sweaters with elbow patches,
// hibiscus Hawaiian shirts, striped tees, floral blouses under a cardigan, sun shirts under a pocket-covered
// vest, plaid flannel under a PVC slicker, quilted parkas, waxed oilskin coats with brass buttons), trousers,
// shorts, skirts, socks, boots and shoes, hands and gloves. Region painters get (u, v) and reconstruct the
// body coordinates (angle round the part, height) so seams, pockets and buttons land where the mesh is.
import type { RGB } from '../gfx/px';
import { Px, mix, shade } from '../gfx/px';
import type { Look } from './looks';
import type { Shape } from './body';
import { LAYOUT, PAGE_W, PAGE_H, VMAP } from './page';
import type { RegKey } from './page';
import { faceLayout } from './head';
import { nz, hh, band, knitK, ribK, cableK, cotton, denim, canvas, plaid, pvc, oilskin, quilted, fur, hairCol, metal } from './fabric';
import { gauss, clamp01 } from './rig';

type Fn = (u: number, v: number, x: number, y: number) => RGB | null;
export function fillReg(P: Px, key: RegKey, fn: Fn) {
  const [rx, ry, rw, rh] = LAYOUT[key];
  for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) {
    const u = (x - rx) / (rw - 1), v = 1 - (y - ry) / (rh - 1);
    const c = fn(u, v, x, y);
    if (c) P.set(x, y, c);
  }
}
/** paint inside a sub-rectangle of a region (region units, v up) */
export function fillSub(P: Px, key: RegKey, u0: number, v0: number, u1: number, v1: number, fn: Fn) {
  const [rx, ry, rw, rh] = LAYOUT[key];
  const x0 = Math.floor(rx + u0 * (rw - 1)), x1 = Math.ceil(rx + u1 * (rw - 1));
  const y0 = Math.floor(ry + (1 - v1) * (rh - 1)), y1 = Math.ceil(ry + (1 - v0) * (rh - 1));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const u = (x - x0) / Math.max(1, x1 - x0), v = 1 - (y - y0) / Math.max(1, y1 - y0);
    const c = fn(u, v, x, y);
    if (c) P.set(x, y, c);
  }
}
const lerpR = (r: readonly number[], v: number) => r[0] + (r[1] - r[0]) * v;
const DEG = (u: number) => -180 + 360 * u;

// ------------------------------------------------------------------ skin
export function skinPx(L: Look, x: number, y: number, k = 1, red = 0): RGB {
  const sk = L.skin;
  const redC: RGB = [Math.min(255, sk[0] * 1.02 + 22), sk[1] * 0.8, sk[2] * 0.78];
  const mott = (nz(x, y, 5, 11) - 0.5) * 0.07 + (hh(x, y, 12) - 0.5) * 0.025;
  const rr = clamp01(red + (nz(x, y, 12, 13) - 0.5) * 0.12 + L.age * 0.04);
  return band(mix(sk, redC, rr * 0.6), k * (1 + mott), x, y, 0.055);
}

function paintHead(P: Px, L: Look, S: Shape) {
  const F = L.face, Fl = faceLayout(L);
  const ink: RGB = shade(L.skin, 0.55);
  const fh = L.facial;
  const stub = fh === 'stubble' ? 1 : fh === 'beard' || fh === 'bigBeard' || fh === 'goatee' ? 0.7 : fh === 'moustache' || fh === 'walrus' ? 0.35 : 0;
  const stubCol = mix(L.facialCol, shade(L.skin, 0.6), 0.45);
  const age = L.age;
  const dpd = 0.00175; // head units per degree near the face
  const dist = (deg: number, y: number, d0: number, y0: number) => Math.hypot((deg - d0) * dpd, y - y0);
  fillReg(P, 'HEAD', (u, v, x, y) => {
    const deg = (u - 0.5) * 360, a = Math.abs(deg), hy = lerpR(VMAP.HEAD, v);
    let k = 1, red = 0;
    // form shading baked lightly: the eye sockets, under the brow, under the nose, the jaw underside, the ear bowl
    k -= 0.1 * gauss(dist(a, hy, Fl.eyeA, Fl.eyeY), 0, Fl.eyeR * 1.5);
    k -= 0.06 * gauss(hy, Fl.browY - 0.012, 0.006) * gauss(a, Fl.eyeA, 12);
    k -= 0.08 * gauss(hy, 0.046, 0.004) * gauss(a, 0, 9);
    k -= 0.14 * clamp01((-0.005 - hy) / 0.03) * (a < 100 ? 1 : 0.5);
    if (a > 96 && a < 125 && hy > 0.05 && hy < 0.115) { k -= 0.12 * gauss(a, 108, 6) * gauss(hy, 0.083, 0.012); red += 0.35; }
    // cheeks, nose, sunburn, blush
    red += F.blush * 0.55 * gauss(a, 40, 13) * gauss(hy, 0.064, 0.016);
    red += F.nose.red * 0.9 * gauss(a, 0, 8) * gauss(hy, 0.058, 0.01);
    red += F.sunburn * (0.4 * gauss(hy, 0.15, 0.03) * gauss(a, 0, 40) + 0.6 * gauss(a, 0, 14) * gauss(hy, 0.07, 0.025) + 0.35 * gauss(a, 35, 16) * gauss(hy, 0.07, 0.02));
    if (L.arch === 'iceFisher') red += 0.3 * gauss(a, 0, 40) * gauss(hy, 0.07, 0.04);
    let c = skinPx(L, x, y, k, red);
    // wrinkles: forehead lines, crow's feet, under-eye bags, nasolabial folds (age)
    if (age > 0.3) {
      for (let i = 0; i < 3; i++) {
        const ly = 0.146 + i * 0.011 + Math.sin(deg * 0.09 + i) * 0.0018;
        if (Math.abs(hy - ly) < 0.0011 && a < 38 - i * 4 && hh(x, i, 3) > 0.15) c = mix(c, ink, 0.32 * age);
      }
      for (let i = 0; i < 3; i++) {
        const ang = -0.5 + i * 0.5, cx = Fl.eyeA + 15 + i * 0.6, cy = Fl.eyeY + ang * 0.008;
        const t = (a - cx) * dpd;
        if (t > 0 && t < 0.012 && Math.abs(hy - (cy + t * ang * 0.6)) < 0.0011) c = mix(c, ink, 0.4 * age);
      }
      const bagY = Fl.eyeY - Fl.eyeR * 1.35 - (Math.abs(a - Fl.eyeA) * dpd) ** 2 * 6;
      if (Math.abs(hy - bagY) < 0.0012 && Math.abs(a - Fl.eyeA) < 11) c = mix(c, ink, 0.38 * age);
    }
    {
      // nasolabial fold: from the nose wing down to the mouth corner
      const t = clamp01((0.054 - hy) / 0.03);
      const fa = 12 + t * 13;
      if (hy < 0.056 && hy > 0.02 && Math.abs(a - fa) < 1.1) c = mix(c, ink, 0.18 + 0.3 * age);
    }
    // freckles over the nose and cheeks
    if (F.freckles > 0 && hy > 0.045 && hy < 0.095 && a < 52 && hh(x, y, 71) > 1 - 0.07 * F.freckles) c = mix(c, shade(mix(L.skin, [160, 90, 50], 0.5), 0.85), 0.55);
    // age spots on the scalp / temples
    if (age > 0.85 && (hy > 0.13 || a > 60) && hh(x, y, 73) > 0.992) c = mix(c, [150, 100, 72], 0.3);
    // stubble / beard shadow: stippled dots over the jaw, chin, upper lip, cheeks
    if (stub > 0) {
      const top = a < 18 ? 0.054 : a < 40 ? 0.05 - (a - 18) * 0.0006 + 0.012 * gauss(a, 32, 6) : a < 80 ? 0.062 + (a - 40) * 0.0008 : 0.098;
      const z = clamp01((top - hy) / 0.012) * (a < 100 ? 1 : 0) * clamp01((hy + 0.03) / 0.015);
      const lip = Math.abs(hy - Fl.mouthY) < 0.006 && a < 24 ? 0.25 : 1;
      if (z > 0 && hh(x, y, 77) < (0.35 + 0.35 * stub) * z * lip) c = mix(c, stubCol, 0.42 + 0.25 * hh(y, x, 78));
    }
    // the captain's scar: a pale slash across the left cheek and brow
    if (F.scar) {
      const sd = Math.abs((deg - 30) * dpd * 0.55 + (hy - 0.08));
      if (sd < 0.0016 && hy > 0.04 && hy < 0.13 && deg > 15 && deg < 52) c = mix(c, [236, 196, 186], 0.55);
      if (sd < 0.0011 && hy > 0.04 && hy < 0.13 && deg > 15 && deg < 52 && ((y + x) % 3 === 0)) c = mix(c, [150, 70, 70], 0.4);
    }
    // eyepatch strap across the forehead and round the head
    if (F.eyepatch) {
      const sgn = F.eyepatch === 'R' ? -1 : 1;
      const d0 = sgn * Fl.eyeA;
      const yl = (deg - d0) * sgn > 0 ? Fl.eyeY + ((deg - d0) * sgn) * 0.00072 : Fl.eyeY + Math.abs(deg - d0) * 0.0002;
      if (Math.abs(hy - Math.min(0.17, yl)) < 0.0042 && Math.abs(deg - d0) > 8) c = band([28, 24, 22], 0.9 + (hh(x, y, 5) - 0.5) * 0.1, x, y);
    }
    // the hair on the scalp under the shells (where the shells are thin or absent)
    if (L.hair.style !== 'none' && hy > hairStart(L, deg) && !(L.hair.style === 'sides' && hy > 0.15 && a < 120)) c = hairCol(shade(L.hair.col, 0.82), L.hair.grey, x * 0.8, y * 1.0, x, y, 0.85);
    void S;
    return c;
  });
}
function hairStart(L: Look, deg: number) {
  const a = Math.abs(deg);
  if (a < 25) return 0.155;
  if (a < 60) return 0.155 - (a - 25) * 0.0007;
  if (a < 105) return 0.13 - (a - 60) * 0.0005;
  return L.hair.style === 'shaggy' ? 0.0 : 0.04;
}

function paintHair(P: Px, L: Look) {
  const base = L.hair.col;
  fillReg(P, 'HAIR', (u, v, x, y) => {
    const deg = (u - 0.5) * 360;
    // strands run down the head (v); darker toward the ends and the nape, a sheen band across the crown
    const light = 0.84 + 0.18 * gauss(v, 0.72, 0.18) - 0.15 * clamp01((0.25 - v) / 0.25);
    let c = hairCol(base, L.hair.grey, x * 1.1 + Math.sin(y * 0.2) * 1.5, y * 1.0, x, y, light);
    if (L.face.eyepatch) {
      const sgn = L.face.eyepatch === 'R' ? -1 : 1;
      if (Math.abs(v - (0.62 + sgn * deg * 0.0005)) < 0.022 && Math.abs(deg) > 70) c = band([28, 24, 22], 0.9, x, y);
    }
    return c;
  });
}

function paintBeard(P: Px, L: Look) {
  const base = L.facialCol;
  fillReg(P, 'BEARD', (u, v, x, y) => {
    if (v < 0.3) {
      // moustache: strands sweep outward and down from the centre
      const dx = (u - 0.5) * 2;
      const su = x * 0.9 + Math.abs(dx) * 14 + y * dx * 1.4;
      return hairCol(base, L.hair.grey, su, y * 0.5 + Math.abs(dx) * 20, x, y, 0.85 + 0.2 * (v / 0.3) - Math.abs(dx) * 0.1);
    }
    const vv = (v - 0.3) / 0.7;
    // locks: soft clumps that wave gently downward; darker in the gaps between them and at the roots
    const lock = Math.sin((x + Math.sin(y * 0.09 + u * 5) * 3) * 0.55) * 0.5 + 0.5;
    const light = 0.9 + 0.12 * lock - 0.1 * clamp01(1 - vv * 4) - 0.08 * Math.abs(u - 0.5) + (nz(x, y, 6, 21) - 0.5) * 0.12;
    const { k } = { k: 0.9 + (hh(x, y >> 2, 22) - 0.5) * 0.18 };
    const hi: RGB = L.hair.grey > 0.5 ? [252, 252, 248] : mix(base, [255, 240, 210], 0.35);
    let c = band(base, light * k, x, y, 0.07);
    if (lock > 0.82 && hh(x, y, 23) > 0.4) c = mix(c, hi, 0.35);
    if (lock < 0.12) c = shade(c, 0.85);
    return c;
  });
}

function paintBrowLids(P: Px, L: Look) {
  const bc = L.face.browCol;
  fillReg(P, 'BROW', (u, v, x, y) => hairCol(bc, L.hair.grey, x * 1.6 + y * 1.2, y + x * 0.4, x, y, 0.85 + v * 0.2));
  // lids: skin, a crease, then the dark lash line along the edge (v = 1 is the lid edge)
  const lash: RGB = L.arch === 'grandma' ? shade(L.skin, 0.45) : [34, 24, 22];
  fillReg(P, 'LIDS', (u, v, x, y) => {
    let c = skinPx(L, x, y, 0.97 - v * 0.05, 0.12 + 0.1 * L.age);
    if (Math.abs(v - 0.55) < 0.04) c = shade(c, 0.86);
    if (v > 0.84) c = mix(c, lash, v > 0.9 ? 1 : 0.6);
    return c;
  });
}

// ------------------------------------------------------------------ garments
/** hibiscus print (Hawaiian shirt) at pixel coords */
function hibiscus(L: Look, x: number, y: number): RGB {
  const base = L.top.col, pet = L.top.col2, leaf = L.top.col3;
  let c = cotton(base, x, y, 1, 21);
  // leaves under the flowers
  {
    const cell = 13, cx = Math.floor(x / cell), cy = Math.floor(y / cell);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const gx = cx + i, gy = cy + j;
      if (hh(gx, gy, 31) > 0.55) continue;
      const px = (gx + hh(gx, gy, 32)) * cell, py = (gy + hh(gx, gy, 33)) * cell;
      const an = hh(gx, gy, 34) * Math.PI;
      const dx = x + 0.5 - px, dy = y + 0.5 - py;
      const lx = dx * Math.cos(an) + dy * Math.sin(an), ly = -dx * Math.sin(an) + dy * Math.cos(an);
      const e = (lx / 7.5) ** 2 + (ly / 2.6) ** 2;
      if (e < 1) c = band(leaf, Math.abs(ly) < 0.6 ? 1.2 : 0.92 + lx * 0.012, x, y);
    }
  }
  const cell = 19, cx = Math.floor(x / cell), cy = Math.floor(y / cell);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const gx = cx + i, gy = cy + j;
    const px = (gx + 0.2 + hh(gx, gy, 41) * 0.6) * cell, py = (gy + 0.2 + hh(gx, gy, 42) * 0.6) * cell;
    const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.hypot(dx, dy);
    const R0 = 6 + hh(gx, gy, 43) * 2.2;
    if (d > R0 + 1) continue;
    const th = Math.atan2(dy, dx) + hh(gx, gy, 44) * 6.28;
    const r = R0 * (0.72 + 0.28 * Math.abs(Math.cos(th * 2.5)));
    if (d < r) {
      const veins = Math.abs(Math.sin(th * 2.5)) < 0.12 ? 0.86 : 1;
      c = band(pet, (0.88 + (d / r) * 0.22) * veins, x, y);
      if (d < 2.2) c = band(mix(pet, [120, 20, 40], 0.6), 0.9, x, y);
    } else if (d < r + 1) c = band(mix(pet, base, 0.5), 0.8, x, y);
    // the stamen
    const sx = px + Math.cos(hh(gx, gy, 45) * 6.28) * R0 * 0.55, sy = py + Math.sin(hh(gx, gy, 45) * 6.28) * R0 * 0.55;
    if (Math.hypot(x + 0.5 - sx, y + 0.5 - sy) < 1.1) c = [255, 226, 90];
  }
  return c;
}
/** small ditsy florals (grandma's blouse) */
function ditsy(L: Look, x: number, y: number): RGB {
  let c = cotton(L.top.col, x, y, 1, 22);
  const cell = 7, gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const px = (gx + 0.3 + hh(gx, gy, 51) * 0.4) * cell, py = (gy + 0.3 + hh(gx, gy, 52) * 0.4) * cell;
  const dx = x + 0.5 - px, dy = y + 0.5 - py, d = Math.abs(dx) + Math.abs(dy);
  if (d < 1.6) c = d < 0.6 ? [250, 220, 120] : band(L.top.col2, 1, x, y);
  else if (Math.abs(dx - 2) < 0.6 && Math.abs(dy + 1) < 0.6) c = band(L.top.col3, 1, x, y);
  return c;
}
function fishEmblem(x: number, y: number, cx: number, cy: number, s: number): number {
  // 0 none, 1 ring, 2 fish body, 3 eye
  const dx = (x + 0.5 - cx) / s, dy = (y + 0.5 - cy) / s, d = Math.hypot(dx, dy);
  if (d > 1.05) return 0;
  if (d > 0.86) return 1;
  const bx = dx + 0.12, e = (bx / 0.5) ** 2 + (dy / 0.3) ** 2;
  if (e < 1) return Math.hypot(bx - 0.25, dy + 0.05) < 0.08 ? 3 : 2;
  if (dx < -0.3 && dx > -0.72 && Math.abs(dy) < (-0.3 - dx) * 0.9) return 2;
  return 0;
}

/** colour of the top garment at angle deg (front = 0, + = wearer's left) and reference height y */
function topPx(L: Look, S: Shape, deg: number, y: number, x: number, py: number, part: 'torso' | 'arm' = 'torso', ay = 0): RGB {
  const T = L.top, a = Math.abs(deg);
  let k = 1;
  // soft fold shadows: armpit folds, the waist, the elbow crook on sleeves
  if (part === 'torso') k -= 0.08 * gauss(y, 1.36, 0.04) * gauss(a, 90, 20) + 0.06 * (nz(x, py * 0.3, 14, 61) > 0.72 ? 1 : 0) * gauss(a, 60, 40);
  else k -= 0.1 * gauss(ay, -0.29, 0.03) * gauss(a, 0, 50);
  const hemBand = part === 'torso' ? y < S.topHem + 0.025 : false;
  switch (T.kind) {
    case 'sweater': {
      const heather = hh(x, py, 81) > 0.82 ? T.col2 : T.col;
      if ((part === 'torso' && y < S.topHem + 0.06) || (part === 'arm' && ay < -0.45)) return band(heather, k * ribK(x, py) * 0.97, x, py);
      // cable panels down the front and back
      if (part === 'torso') {
        for (const cd of [-34, 0, 34, 146, 180, -146]) {
          const lx = ((deg - cd) / 360) * 224 + 5;
          if (lx >= 0 && lx < 10) { const ck = cableK(lx, py, 10, 16); return band(heather, k * (ck || 0.78), x, py); }
          if (lx >= -2 && lx < 0 || lx >= 10 && lx < 12) return band(heather, k * ((py & 1) ? 0.8 : 0.9), x, py); // purl gutters
        }
      } else {
        const lx = ((deg - 90) / 360) * 64 + 4;
        if (lx >= 0 && lx < 8) { const ck = cableK(lx, py, 8, 14); return band(heather, k * (ck || 0.78), x, py); }
        // suede elbow patches
        if (L.arch === 'oldSalt' && Math.hypot((deg - 180) * 0.0007, ay + 0.3) < 0.045) {
          const e = Math.hypot((deg - 180) * 0.0007, ay + 0.3);
          return e > 0.04 ? band([90, 64, 44], 0.7, x, py) : band([120, 88, 60], 0.95 + (nz(x, py, 4, 3) - 0.5) * 0.25, x, py);
        }
      }
      return band(heather, k * knitK(x, py), x, py);
    }
    case 'hawaiian': {
      let c = hibiscus(L, x, py);
      if (part === 'torso') {
        // button placket, open top with a V of chest, a chest pocket (print slightly offset)
        if (y > 1.37 && a < (y - 1.37) * 260) return skinPx(L, x, py, 0.95 - (y - 1.37) * 0.4, 0.15);
        if (a < 2.2 && y < 1.37) c = shade(c, 0.85);
        if (a < 1.4 && y < 1.36 && ((y * 100) | 0) % 7 === 0) c = [240, 236, 220];
        if (deg > 18 && deg < 40 && y > 1.2 && y < 1.3) {
          if (Math.abs(y - 1.3) < 0.004 || Math.abs(deg - 18) < 0.8 || Math.abs(deg - 40) < 0.8 || Math.abs(y - 1.2) < 0.004) c = shade(c, 0.75);
          else c = hibiscus(L, x + 5, py + 3);
        }
      }
      if (hemBand || (part === 'arm' && ay < S.sleeveY + 0.02)) c = shade(c, 0.88);
      return band(c, k, x, py, 0.04);
    }
    case 'tee': {
      const stripe = Math.floor(py / 6) % 2 === 0;
      let c = cotton(stripe ? T.col : T.col2, x, py, k, 23);
      if (part === 'torso' && deg > -30 && deg < 30) {
        const e = fishEmblem(x, py, ((deg + 0) / 360) * 224, 0, 1) && 0;
        void e;
        const fx = (deg / 360) * 224, fy = (y - 1.27) * 267;
        const m = fishEmblem(fx, fy, 0, 0, 13);
        if (m === 1) c = cotton(T.col3, x, py, 1, 24);
        else if (m === 2) c = cotton(T.col2 === T.col ? [40, 40, 40] : mix(T.col2, [255, 160, 40], 0.5), x, py, 1.05, 25);
        else if (m === 3) c = [30, 30, 30];
        else if (Math.hypot(fx, fy) < 13) c = cotton([250, 250, 250], x, py, 0.98, 26);
      }
      if (hemBand || (part === 'arm' && ay < S.sleeveY + 0.02)) c = shade(c, 0.88);
      return c;
    }
    case 'blouse': {
      let c = ditsy(L, x, py);
      if (part === 'torso' && a < 1.5 && ((y * 100) | 0) % 6 === 0) c = [250, 248, 240];
      return band(c, k, x, py, 0.04);
    }
    case 'sunshirt': {
      const heather = hh(x, py, 82) > 0.75 ? shade(T.col, 0.92) : T.col;
      // raglan shoulder panels, a hook logo on the chest, scale print down the sleeves
      if (part === 'torso' && y > 1.33 + Math.abs(Math.cos((deg * Math.PI) / 180)) * 0.08) return band(T.col2, k, x, py);
      if (part === 'arm') {
        if (ay > -0.08) return band(T.col2, k, x, py);
        const sx = x % 6, sy = (py + (Math.floor(x / 6) & 1) * 3) % 6;
        if (Math.hypot(sx - 3, sy - 2) < 2.4 && Math.hypot(sx - 3, sy - 2) > 1.6) return band(heather, k * 0.9, x, py);
        if (ay < -0.48) return band(T.col2, k, x, py);
      }
      if (part === 'torso' && deg > 18 && deg < 34 && y > 1.24 && y < 1.3) return Math.abs(deg - 26) < 2 || Math.abs(y - 1.255) < 0.006 ? [240, 240, 240] : band(T.col2, k, x, py);
      return band(heather, k, x, py, 0.05);
    }
    case 'thermal': {
      const w = (x % 3 === 0 || py % 3 === 0) ? 0.88 : 1.04;
      if (part === 'arm' && ay < -0.46) return band(T.col, k * ribK(x, py), x, py);
      return band(T.col, k * w, x, py, 0.05);
    }
    case 'flannel': {
      let c = plaid(T.col, T.col2, T.col3, x, py, k, 18);
      if (part === 'torso') {
        if (a < 2) c = shade(c, 0.9);
        if (a < 1.2 && ((y * 100) | 0) % 8 === 0) c = [230, 222, 200];
        for (const pd of [-28, 28]) if (Math.abs(deg - pd) < 9 && y > 1.2 && y < 1.32) { c = Math.abs(y - 1.29) < 0.004 || Math.abs(Math.abs(deg - pd) - 9) < 0.9 ? shade(c, 0.7) : y > 1.29 ? shade(plaid(T.col, T.col2, T.col3, x + 4, py, k, 18), 1.02) : c; }
      }
      return c;
    }
    case 'henley': {
      let c = band(hh(x, py, 83) > 0.7 ? T.col2 : T.col, k * (1 + (nz(x, py, 8, 84) - 0.5) * 0.12), x, py, 0.06);
      if (part === 'torso' && a < 3 && y > 1.3) { c = shade(c, 0.8); if (a < 1.3 && ((y * 100) | 0) % 5 === 0) c = metal(T.col3, x, py, 1.1); }
      return c;
    }
  }
  return [200, 0, 200];
}

/** trousers / shorts / skirt / overalls fabric at a texel (torso below the waist and the legs) */
function legsPx(L: Look, S: Shape, deg: number, x: number, py: number, k = 1): RGB {
  const G = L.legs;
  switch (G.kind) {
    case 'snowpants': return band(G.col, k * (1 + (nz(x, py, 12, 91) - 0.5) * 0.1 + (hh(x, py, 92) - 0.5) * 0.03), x, py, 0.06);
    case 'overalls': return L.arch === 'dockWorker' && G.col[0] > 150 ? pvc(G.col, x, py, k, 93) : canvas(G.col, x, py, k, 94);
    case 'shorts': return L.arch === 'kid' ? denim(G.col, x, py, k, 95) : canvas(G.col, x, py, k, 96);
    case 'skirt': return band(G.col, k * (1 + (nz(x, py, 10, 97) - 0.5) * 0.1), x, py, 0.06);
    default: return L.arch === 'proAngler' ? canvas(G.col, x, py, k, 98) : denim(G.col, x, py, k, 99);
  }
  void S; void deg;
}

function paintTorso(P: Px, L: Look, S: Shape) {
  const belt = L.extras.belt ?? (L.legs.kind === 'pants' ? mix(L.legs.col, [40, 26, 18], 0.75) : null);
  fillReg(P, 'TORSO', (u, v, x, y) => {
    const deg = DEG(u), a = Math.abs(deg), yy = lerpR(VMAP.TORSO, v);
    const overBib = L.legs.kind === 'overalls' && ((a < 40 && yy < 1.3) || yy < S.waist);
    const strap = L.legs.kind === 'overalls' && yy >= 1.28 && (Math.abs(a - 24 - (yy - 1.28) * 30) < 5 || Math.abs(Math.abs(deg) - 156 + (yy - 1.28) * 60) < 5);
    if (overBib || strap) {
      let c = legsPx(L, S, deg, x, y, 1);
      if (a < 40 && yy < 1.3 && yy > 1.02 && (Math.abs(a - 40) < 1 || Math.abs(yy - 1.3) < 0.004)) c = shade(c, 0.72);
      if (a < 18 && yy > 1.12 && yy < 1.24) c = Math.abs(yy - 1.24) < 0.004 || Math.abs(a - 18) < 1 ? shade(c, 0.7) : shade(c, 0.95); // bib pocket
      if (strap && yy > 1.27 && yy < 1.3 && a < 50) c = metal([180, 180, 170], x, y, 1.1);  // strap buckles
      return c;
    }
    const covered = yy >= S.topHem && !(S.tuck && yy < S.waist);
    if (covered) return topPx(L, S, deg, yy, x, y, 'torso');
    if (yy < S.waist + 0.005) {
      // trousers waist: belt with a buckle, belt loops
      if (belt && yy > S.waist - 0.03) {
        if (a < 5) return metal([196, 170, 100], x, y, Math.abs(yy - (S.waist - 0.015)) < 0.006 && a < 3 ? 0.7 : 1.15);
        if ((Math.abs(a - 40) < 1.5 || Math.abs(a - 110) < 1.5 || Math.abs(a - 170) < 1.5)) return legsPx(L, S, deg, x, y, 1.05);
        return band(belt, 0.95 + (hh(x, y, 5) - 0.5) * 0.08, x, y);
      }
      let c = legsPx(L, S, deg, x, y, 1 - 0.1 * gauss(yy, 0.82, 0.03));
      if (a < 1 && yy < S.waist - 0.03 && yy > 0.86) c = shade(c, 0.78); // fly seam
      return c;
    }
    return skinPx(L, x, y, 1, 0.05);
  });
  // neck: skin, darker under the jaw, a few lines with age
  fillReg(P, 'NECK', (u, v, x, y) => {
    let c = skinPx(L, x, y, 0.92 + v * 0.06 - 0.08 * gauss(v, 0.92, 0.08), 0.06);
    if (L.age > 0.5 && (y % 7 === 0) && hh(x, y, 9) > 0.3) c = shade(c, 0.9);
    return c;
  });
}

function paintArms(P: Px, L: Look, S: Shape) {
  const O = L.outer;
  for (const key of ['ARM_L', 'ARM_R'] as const) {
    const mir = key === 'ARM_L' ? 1 : -1;
    fillReg(P, key, (u, v, x, y) => {
      const deg = DEG(u), ay = lerpR(VMAP.ARM, v);
      if (L.hands.kind !== 'bare' && ay < -0.47) return glovePx(L, x, y, 1, ay < -0.47 && ay > -0.49);
      if (ay > S.sleeveY) {
        if (S.outerSleeve) return outerPx(L, S, deg * mir, 1.25, x, y, 'arm', ay);
        return topPx(L, S, deg, 1.2, x, y, 'arm', ay);
      }
      // bare forearm: a touch of hair for the grown men, the elbow darker / redder
      let c = skinPx(L, x, y, 1 - 0.05 * gauss(ay, -0.3, 0.02), 0.1 * gauss(ay, -0.3, 0.03) + 0.05);
      if (L.build.fem < 0.5 && L.arch !== 'kid' && ay < -0.3 && hh(x, y, 15) > 0.975) c = shade(mix(c, L.hair.col, 0.4), 0.9);
      if (L.extras.watch && key === 'ARM_L' && ay < -0.47 && ay > -0.5) {
        c = Math.abs(deg - 90) < 30 ? (Math.abs(deg - 90) < 20 ? [40, 44, 48] : metal([190, 190, 196], x, y)) : band([40, 34, 30], 1, x, y);
      }
      void O;
      return c;
    });
  }
}

function glovePx(L: Look, x: number, y: number, k = 1, cuff = false): RGB {
  const c = L.hands.col;
  if (L.hands.kind === 'mitten') return band(c, k * (cuff ? ribK(x, y) : knitK(x, y)), x, y);
  return pvc(c, x, y, k * (cuff ? 0.85 : 1), 31);
}

function paintHands(P: Px, L: Look) {
  for (const key of ['HAND_L', 'HAND_R'] as const) {
    fillReg(P, key, (u, v, x, y) => {
      if (L.hands.kind !== 'bare') {
        let c = glovePx(L, x, y, 1 - (v < 0.5 ? 0.05 : 0));
        if (L.hands.kind === 'mitten' && v > 0.85) c = band(L.hands.col, ribK(x, y), x, y);
        return c;
      }
      let c = skinPx(L, x, y, 1, 0.12 + 0.12 * gauss(v, 0.55, 0.06));
      // knuckle creases and nails at the fingertips
      if (Math.abs(v - 0.3) < 0.015 || Math.abs(v - 0.55) < 0.012) c = shade(c, 0.86);
      if (v < 0.1 && (u * 8) % 2 < 1.2) c = mix(c, [246, 214, 206], 0.55);
      if (L.age > 0.6 && hh(x, y, 17) > 0.96) c = mix(c, [150, 100, 72], 0.25);
      return c;
    });
  }
}

function paintLegs(P: Px, L: Look, S: Shape) {
  const G = L.legs;
  for (const key of ['LEG_L', 'LEG_R'] as const) {
    const mir = key === 'LEG_L' ? 1 : -1;
    fillReg(P, key, (u, v, x, y) => {
      const deg = DEG(u), a = Math.abs(deg), ly = lerpR(VMAP.LEG, v);
      // boot shafts
      if (ly < S.bootTop) {
        const top = S.bootTop - ly;
        if (S.feet === 'rubber') return top < 0.012 ? pvc(shade(L.feet.col, 1.1), x, y, 1, 41) : pvc(L.feet.col, x, y, 1 - 0.1 * gauss(ly, -0.75, 0.02), 42);
        if (S.feet === 'snow') return top < 0.035 ? fur(L.feet.col2, x, y, 1, 43) : quilted(mix(L.feet.col, [60, 60, 70], 0.3), x, y, 16, 1, 44);
        // hiking boot: leather with lace hooks up the front
        let c = band(L.feet.col, 0.95 + (nz(x, y, 6, 45) - 0.5) * 0.2, x, y);
        if (a < 9 && ly > -0.86) c = (y % 5 === 0 && Math.abs(a - 6) < 2) ? metal([200, 190, 160], x, y) : a < 4 ? band([200, 170, 120], (x + y) % 2 ? 1 : 0.8, x, y) : shade(c, 0.85);
        if (top < 0.012) c = band(shade(L.feet.col, 0.7), 1, x, y);
        return c;
      }
      const cov = G.kind !== 'skirt' && ly > S.legHem;
      if (cov) {
        let k = 1 - 0.1 * gauss(ly, -0.46, 0.03) * gauss(a, 180, 40) - (nz(x, y * 0.4, 10, 46) > 0.75 ? 0.06 : 0);
        if (ly < S.legHem + 0.022 && G.kind === 'shorts') k *= 0.85;
        let c = legsPx(L, S, deg, x, y, k);
        // side seams, knee wear, cargo pockets
        if (Math.abs(a - 90) < 1.6) c = shade(c, 0.82);
        if (G.kind === 'pants' && Math.hypot(deg * 0.0012, ly + 0.45) < 0.045) c = mix(c, [220, 220, 220], 0.12);
        const pd = 90 * mir === 90 ? 90 : 90;
        if ((L.arch === 'weekendDad' || L.arch === 'proAngler') && Math.abs(deg - pd) < 26 && ly < -0.1 && ly > (G.kind === 'shorts' ? -0.22 : -0.32)) {
          const top = G.kind === 'shorts' ? -0.1 : -0.15;
          if (Math.abs(Math.abs(deg - pd) - 26) < 1.2 || Math.abs(ly - (G.kind === 'shorts' ? -0.22 : -0.32)) < 0.004) c = shade(c, 0.7);
          else if (ly > top - 0.04) c = Math.abs(ly - (top - 0.04)) < 0.004 ? shade(c, 0.65) : shade(c, 1.05); // the flap
        }
        if (G.kind === 'snowpants' && Math.hypot(deg * 0.0012, ly + 0.45) < 0.06) c = band(G.col2, 0.95, x, y); // knee reinforcement
        return c;
      }
      // socks
      if (ly < -0.74 && (S.feet === 'sneaker' || S.feet === 'sandal' || S.feet === 'shoe')) {
        if (S.feet === 'shoe' && L.build.fem > 0.5) return skinPx(L, x, y, 0.95, 0.1);
        return band(S.feet === 'sneaker' && L.arch === 'kid' ? [250, 250, 250] : L.feet.col2, ly > -0.765 ? ribK(x, y) : 0.98 + (hh(x, y, 47) - 0.5) * 0.06, x, y);
      }
      if (L.arch === 'weekendDad' && ly < -0.6) {
        // tube socks pulled right up the calf, with stripes
        const st = ly > -0.64 ? 1 : 0;
        if (st || ly > -0.66) return band(ly > -0.625 && ly < -0.61 ? [40, 90, 180] : ly > -0.645 && ly < -0.635 ? [200, 50, 40] : [246, 246, 240], ribK(x, y), x, y);
        return band([246, 246, 240], 0.98 + (hh(x, y, 47) - 0.5) * 0.05, x, y);
      }
      // bare legs (grandma's in nylon stockings)
      if (L.build.fem > 0.5) return band(mix(skinPx(L, x, y, 1, 0.05), [200, 170, 150], 0.25), 0.97, x, y, 0.05);
      let c = skinPx(L, x, y, 1 - 0.05 * gauss(ly, -0.445, 0.02), 0.1 * gauss(ly, -0.445, 0.03));
      if (L.arch !== 'kid' && hh(x, y, 48) > 0.965) c = mix(c, L.hair.col, 0.3);
      if (L.arch === 'kid' && Math.hypot(deg * 0.001, ly + 0.45) < 0.02 && hh(x >> 1, y >> 1, 3) > 0.4) c = mix(c, [200, 90, 80], 0.35); // scraped knee
      return c;
    });
  }
}

function paintFeet(P: Px, L: Look, S: Shape) {
  const F = L.feet;
  for (const key of ['FOOT_L', 'FOOT_R'] as const) {
    fillReg(P, key, (u, v, x, y) => {
      if (v > 0.74) {
        // lace / strap swatches
        if (S.feet === 'sandal') return band([110, 72, 44], 1 + (hh(x, y, 3) - 0.5) * 0.1, x, y);
        return band(S.feet === 'boot' ? [200, 170, 110] : [250, 250, 250], (x + y) % 2 ? 1 : 0.85, x, y);
      }
      const a = (u - 0.5) * 360, aa = Math.abs(a);
      const sole = aa > 89;
      const toe = v > 0.55, heel = v < 0.16;
      switch (S.feet) {
        case 'sneaker': {
          if (sole) return band(aa > 120 ? [200, 196, 190] : F.col2, (aa > 120 && ((x + y) % 3 === 0)) ? 0.85 : 1, x, y);
          let c = cotton(F.col, x, y, 1, 51);
          if (toe && aa < 70) c = band(F.col2, 1, x, y);
          if (Math.abs(aa - 55 - (v - 0.3) * 30) < 5 && v > 0.15 && v < 0.55) c = band(F.col2, 1.05, x, y);
          if (heel) c = band(mix(F.col, [30, 30, 30], 0.3), 1, x, y);
          return c;
        }
        case 'boot': {
          if (sole) return band([40, 34, 30], (y % 3 === 0 && aa > 100) ? 0.7 : 1, x, y);
          let c = band(F.col, 0.95 + (nz(x, y, 6, 52) - 0.5) * 0.22, x, y);
          if (toe || heel) c = shade(c, 0.85);
          if (Math.abs(aa - 80) < 3) c = shade(c, 0.75); // welt stitching
          return c;
        }
        case 'rubber': {
          if (sole) return band(F.col2, (y % 2 === 0 && aa > 110) ? 0.8 : 1, x, y);
          let c = pvc(F.col, x, y, 1, 53);
          if (aa > 70) c = band(F.col2, 1, x, y);   // the toe-band / foxing
          return c;
        }
        case 'snow': {
          if (sole) return band([36, 34, 32], (x % 3 === 0 && aa > 100) ? 0.7 : 1, x, y);
          return aa > 55 || toe ? pvc([50, 46, 44], x, y, 1, 54) : quilted(mix(F.col, [60, 60, 70], 0.3), x, y, 12, 1, 55);
        }
        case 'shoe': {
          if (sole) return band([60, 46, 36], 1, x, y);
          let c = band(F.col, 0.97 + (nz(x, y, 8, 56) - 0.5) * 0.12, x, y);
          if (Math.abs(aa - 30) < 2 && toe) c = shade(c, 0.8);
          if (Math.abs(aa - 75) < 1) c = shade(c, 0.8);
          return c;
        }
        case 'sandal': {
          if (sole || aa > 80) return band(F.col, 0.95 + (hh(x, y, 57) - 0.5) * 0.1, x, y);
          return band(F.col2, knitK(x, y) * 1.02, x, y);
        }
      }
      return [255, 0, 255];
    });
  }
}

/** the outer garment at angle deg / reference height y (also used for its sleeves and coat tails) */
function outerPx(L: Look, S: Shape, deg: number, y: number, x: number, py: number, part: 'torso' | 'arm' | 'tails' = 'torso', ay = 0, u = 0.5): RGB {
  const O = L.outer, a = Math.abs(deg);
  let k = 1;
  if (part === 'torso') k -= 0.08 * gauss(y, 1.36, 0.04) * gauss(a, 90, 20);
  if (part === 'arm') k -= 0.1 * gauss(ay, -0.29, 0.03) * gauss(a, 0, 50);
  const cuff = part === 'arm' && ay < -0.47;
  switch (O.kind) {
    case 'cardigan': {
      const heather = hh(x, py, 61) > 0.85 ? O.col2 : O.col;
      if (cuff || (part === 'torso' && y < S.outerHem + 0.04)) return band(heather, k * ribK(x, py), x, py);
      if (part === 'torso') {
        const edge = Math.abs(u - 0.5) * 360;   // angle of the opening edge column in uv space
        const gp0 = 9;
        if (edge < gp0 + 7) {
          let c = band(heather, k * ribK(py, x) * 0.98, x, py);
          // buttons on the wearer's right band, button holes on the left
          if (deg < 0 && ((Math.floor(py / 9) % 2) === 0) && Math.abs(edge - gp0 - 3.5) < 2.2 && (py % 9) < 4) c = band(O.col2, 0.75, x, py);
          if (deg < 0 && (py % 18) < 4 && Math.abs(edge - gp0 - 3.5) < 2) c = band([240, 232, 210], (py % 18) === 1 ? 1.1 : 0.9, x, py);
          return c;
        }
        // patch pockets low on the front
        if (a > 30 && a < 62 && y > S.outerHem + 0.05 && y < S.outerHem + 0.15) {
          if (Math.abs(y - (S.outerHem + 0.15)) < 0.012) return band(heather, k * ribK(x, py) * 0.95, x, py);
          if (Math.abs(a - 30) < 1 || Math.abs(a - 62) < 1 || Math.abs(y - (S.outerHem + 0.05)) < 0.004) return band(heather, k * 0.78, x, py);
        }
      }
      return band(heather, k * knitK(x, py, 3, 3), x, py);
    }
    case 'vest': {
      // mesh back panel, canvas front covered in pockets, a centre zip
      if (a > 120 && y > 1.1) return ((x % 3 === 0) || (py % 3 === 0)) ? band(O.col2, 0.8, x, py) : band(O.col, 0.75, x, py);
      let c = canvas(O.col, x, py, k, 62);
      if (a < 1.6) return metal([150, 150, 150], x, py, (py % 2) ? 1.05 : 0.8);
      if (a < 3.5) c = shade(c, 0.85);
      // pockets: [deg0, deg1, y0, y1, flap]
      const pk: [number, number, number, number, boolean][] = [[8, 34, 0.98, 1.12, true], [-34, -8, 0.98, 1.12, true], [10, 30, 1.18, 1.3, true], [-30, -10, 1.18, 1.3, true], [36, 54, 1.04, 1.18, false], [-54, -36, 1.04, 1.18, false]];
      for (const [d0, d1, y0, y1, flap] of pk) {
        if (deg >= d0 && deg <= d1 && y >= y0 && y <= y1) {
          const ed = Math.min(deg - d0, d1 - deg) * 0.0016, ey = Math.min(y - y0, y1 - y);
          if (ed < 0.0016 || ey < 0.004) return shade(c, 0.68);
          if ((ed < 0.004 || ey < 0.008) && (py + x) % 3 === 0) return shade(c, 1.12); // stitching
          if (flap && y > y1 - 0.035) { if (Math.abs(y - (y1 - 0.035)) < 0.004) return shade(c, 0.66); if (Math.abs(deg - (d0 + d1) / 2) < 1.5 && Math.abs(y - (y1 - 0.02)) < 0.008) return metal([170, 160, 140], x, py); return shade(c, 1.06); }
          return shade(c, 0.97);
        }
      }
      // foam fly patch on the left chest
      if (deg > 34 && deg < 52 && y > 1.24 && y < 1.36) return band([210, 204, 190], ((x >> 1) + (py >> 1)) % 2 ? 1 : 0.88, x, py);
      if (y < S.outerHem + 0.012) return shade(c, 0.8);
      return c;
    }
    case 'parka': {
      if (part === 'arm') {
        if (cuff) return band(shade(O.col, 0.6), ribK(x, py), x, py);
        return quilted(O.col, x, py, 12, k, 63);
      }
      let c = quilted(O.col, x, py, 14, k, 64);
      if (a < 2.4) return a < 1.2 ? metal([60, 60, 64], x, py, (py % 2) ? 1.1 : 0.75) : band(shade(O.col, 0.7), 1, x, py);
      // slash pockets with flaps, a hem drawcord band
      if (part !== 'tails' && a > 26 && a < 56 && y > 0.96 && y < 1.08) {
        if (Math.abs(y - 1.08) < 0.005 || Math.abs(a - 26) < 1 || Math.abs(a - 56) < 1) return band(shade(O.col, 0.7), 1, x, py);
        if (y > 1.04) return band(O.col, 1.08, x, py);
      }
      if (y < S.outerHem + 0.025) c = band(O.col2, 0.95 + ((x >> 1) & 1) * 0.06, x, py);
      return c;
    }
    case 'slicker': {
      if (part === 'arm') return cuff ? pvc(shade(O.col, 0.85), x, py, 0.9, 65) : pvc(O.col, x, py, k, 66);
      let c = pvc(O.col, x, py, k, 67);
      const edge = Math.abs(u - 0.5) * 360;
      if (part === 'torso' && edge < 13) {
        c = pvc(O.col, x, py, k * 0.95, 68);
        if ((py % 14) < 4 && Math.abs(edge - 8.5) < 2.4) c = metal([170, 170, 168], x, py, (py % 14) === 1 ? 1.25 : 0.9);
        return c;
      }
      // welded seams and big patch pockets
      if (Math.abs(a - 95) < 1.2 || Math.abs(y - 1.36) < 0.004) c = shade(c, 0.85);
      if (part !== 'tails' && a > 26 && a < 60 && y > S.outerHem + 0.05 && y < S.outerHem + 0.2) {
        if (Math.abs(a - 26) < 1 || Math.abs(a - 60) < 1 || Math.abs(y - (S.outerHem + 0.05)) < 0.004) return shade(c, 0.72);
        if (y > S.outerHem + 0.16) return Math.abs(y - (S.outerHem + 0.16)) < 0.004 ? shade(c, 0.7) : shade(c, 1.06);
      }
      if (y < S.outerHem + 0.02 && part === 'tails') c = shade(c, 0.88);
      return c;
    }
    case 'raincoat': {
      if (part === 'arm') {
        if (cuff) return oilskin(shade(O.col, 0.85), x, py, 0.9, 69);
        let c = oilskin(O.col, x, py, k, 70);
        if (ay < -0.42 && ay > -0.44 && Math.abs(deg - 90) < 30) c = metal(O.col2, x, py, 1.05); // cuff buttons
        return c;
      }
      let c = oilskin(O.col, x, py, k, 71);
      // double-breasted brass buttons, a belt, piping on the shoulders
      if (part === 'torso') {
        if (Math.abs(y - 1.03) < 0.022) {
          if (a < 5) return metal(O.col2, x, py, Math.abs(y - 1.03) < 0.01 && a < 3 ? 0.65 : 1.15);
          return band(L.extras.belt ?? [50, 36, 26], 0.95 + (hh(x, py, 5) - 0.5) * 0.08, x, py);
        }
        for (const bd of [-17, 17]) for (let i = 0; i < 4; i++) {
          const by = 1.12 + i * 0.075;
          const d = Math.hypot((deg - bd) * 0.0017, y - by);
          if (d < 0.011) return metal(O.col2, x, py, d < 0.006 ? 1.25 - (y - by) * 20 : 0.8);
        }
        if (Math.abs(deg + 6) < 0.9 && y > 1.06) c = shade(c, 0.7);  // the overlap edge
        if (y > 1.4 && Math.abs(a - 90) < 6) c = band(O.col2, 0.8, x, py);
      }
      if (part === 'tails' && y < S.outerHem + 0.03) c = shade(c, 0.85);
      return c;
    }
  }
  return [255, 0, 255];
}

function paintOuter(P: Px, L: Look, S: Shape) {
  if (L.outer.kind === 'none') return;
  fillReg(P, 'OUTER', (u, v, x, y) => outerPx(L, S, DEG(u), lerpR(VMAP.TORSO, v), x, y, 'torso', 0, u));
}

function paintTails(P: Px, L: Look, S: Shape) {
  fillReg(P, 'TAILS', (u, v, x, y) => {
    const deg = DEG(u), yy = lerpR(VMAP.TAILS, v);
    if (L.legs.kind === 'skirt') {
      // pleated wool skirt with a hem band
      const pl = Math.sin(deg * 0.157 * 9 / 1.414);
      let c = band(L.legs.col, 0.95 + pl * 0.06 + (nz(x, y, 10, 81) - 0.5) * 0.08, x, y, 0.06);
      if (yy < 0.94 + (L.legs.hem + 0.02) * L.build.legLen + 0.02) c = shade(c, 0.85);
      if (yy > 0.99) c = shade(c, 0.85);
      return c;
    }
    return outerPx(L, S, deg, yy, x, y, 'tails', 0, u);
  });
}

function paintCollars(P: Px, L: Look, S: Shape) {
  fillReg(P, 'COLLAR', (u, v, x, y) => {
    if (S.collar === 'roll') return band(L.top.col, ribK(x, y) * (0.95 + v * 0.08), x, y);
    if (S.collar === 'camp') return band(hibiscus(L, x, y), v > 0.9 ? 0.85 : 1, x, y, 0.04);
    if (S.collar === 'shirt') return L.top.kind === 'flannel' ? plaid(L.top.col, L.top.col2, L.top.col3, x, y, v > 0.9 ? 0.85 : 1, 18) : cotton(L.top.col, x, y, v > 0.9 ? 0.9 : 1, 3);
    return band(L.top.col, ribK(x, y), x, y);
  });
  // hoods (parka with a fur ruff, slicker, the raincoat's stand-up collar) live in the EXTRA region
  if (L.outer.kind === 'parka' || L.outer.kind === 'slicker' || L.outer.kind === 'raincoat') {
    fillSub(P, 'EXTRA', 0, 0, 0.5, 0.7, (u, v, x, y) => {
      if (L.outer.kind === 'parka') return v > 0.55 ? fur([150, 126, 96], x, y, 1, 82) : quilted(L.outer.col, x, y, 10, 1, 83);
      if (L.outer.kind === 'slicker') return pvc(L.outer.col, x, y, 0.95, 84);
      return v > 0.85 ? oilskin(shade(L.outer.col, 1.1), x, y, 1, 85) : oilskin(L.outer.col, x, y, 1, 86);
    });
  }
  if (L.extras.scarf) {
    const sc = L.extras.scarf;
    fillSub(P, 'EXTRA', 0, 0.7, 0.62, 1, (u, v, x, y) => band(Math.floor(y / 7) % 3 === 0 ? mix(sc, [250, 250, 250], 0.7) : sc, knitK(x, y), x, y));
  }
}

/** paint the whole page (everything except the mouth atlas and gear, which face.ts / gear.ts add) */
export function paintPage(L: Look, S: Shape): Px {
  const P = new Px(PAGE_W, PAGE_H);
  paintHead(P, L, S);
  paintHair(P, L);
  paintBeard(P, L);
  paintBrowLids(P, L);
  paintTorso(P, L, S);
  paintArms(P, L, S);
  paintHands(P, L);
  paintLegs(P, L, S);
  paintFeet(P, L, S);
  paintOuter(P, L, S);
  paintTails(P, L, S);
  paintCollars(P, L, S);
  return P;
}
export { outerPx, topPx, legsPx };
