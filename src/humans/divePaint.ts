// Dive kit painter: overpaints a diver's page after paint.ts (the body underneath is the same Limbophobia
// person). Realistic, not cartoony, at PS1/PS2 texel density:
//   - neoprene: nylon-jersey laminate with a fine knit grain, glued-and-blind-stitched seams, colour panels,
//     Supratex knee pads (moulded rubber dots), a back zip with its pull strap, a smooth-skin chest panel that
//     catches a wet highlight, faded maker's print on the thigh;
//   - spearfishing camo (olive / sand / kelp blotches), all-black commando suits, medic whites with red crosses;
//   - the Mark V heavy diver's rubberised canvas twill (grime toward the boots, sewn-on patches, rubber cuffs);
//   - the BCD jacket, its straps and buckles, the weight belt with lead blocks, a calf knife sheath;
//   - the hood (face opening, rolled face seal, the mask strap) and neck;
//   - nemesis scars on top of everything: burns, bandages, bite marks, stitched cuts.
import type { RGB } from '../gfx/px';
import { Px, mix, shade } from '../gfx/px';
import type { Look, DiveKit } from './looks';
import type { Shape } from './body';
import { VMAP } from './page';
import type { RegKey } from './page';
import { fillReg, skinPx } from './paint';
import { nz, hh, band, metal } from './fabric';
import { gauss, clamp01 } from './rig';
import { hoodOval, faceLayout } from './head';

const lerpR = (r: readonly number[], v: number) => r[0] + (r[1] - r[0]) * v;
const DEG = (u: number) => -180 + 360 * u;

/** neoprene texel: knit grain, a slight sheen band, banded + dithered */
function neo(c: RGB, x: number, y: number, k = 1, seed = 3): RGB {
  const grain = ((x + (y >> 1)) & 1 ? 0.97 : 1.03) * (1 + (hh(x, y, seed) - 0.5) * 0.06);
  const mott = 1 + (nz(x, y, 14, seed) - 0.5) * 0.1;
  return band(c, k * grain * mott, x, y, 0.07);
}
/** moulded rubber knee / elbow pad: raised dots */
function pad(c: RGB, x: number, y: number, k = 1): RGB {
  const dot = (x % 3 === 1 && y % 3 === 1) ? 1.25 : (x % 3 === 2 && y % 3 === 2) ? 0.78 : 0.95;
  return band(c, k * dot, x, y, 0.08);
}
/** camo blotches */
function camo(D: DiveKit, x: number, y: number, k = 1): RGB {
  const a = nz(x * 0.9, y * 0.6, 22, 41), b = nz(x * 0.7, y * 1.1, 13, 43);
  const c = a > 0.62 ? D.col2 : b > 0.66 ? D.col3 : b < 0.3 ? mix(D.col, D.col2, 0.35) : D.col;
  return neo(c, x, y, k, 44);
}
/** canvas twill (diagonal weave) */
function twill(c: RGB, x: number, y: number, k = 1, seed = 5): RGB {
  const w = ((x + y) % 4 < 2) ? 1.04 : 0.95;
  return band(c, k * w * (1 + (nz(x, y, 9, seed) - 0.5) * 0.16) * (1 + (hh(x, y, seed) - 0.5) * 0.05), x, y, 0.065);
}

/** the suit's base colour / material at a body point (deg round the part, h = height in reference metres) */
function suitPx(D: DiveKit, x: number, y: number, part: 'torso' | 'arm' | 'leg', deg: number, h: number, k = 1): RGB {
  const a = Math.abs(deg);
  if (D.suit === 'canvas') {
    // grime rises from the boots, sweat darkens the armpits
    const grime = part === 'leg' ? clamp01((-0.3 - h) / 0.5) * 0.25 : 0;
    let c = twill(mix(D.col, [52, 44, 34], grime), x, y, k * (1 - (nz(x, y, 30, 7) > 0.7 ? 0.08 : 0)));
    // seams down the sides
    if (Math.abs(a - 90) < 1.4 && (y % 3)) c = shade(c, 0.78);
    return c;
  }
  if (D.pattern === 'camo') return camo(D, x, y, k);
  let col = D.col;
  if (D.pattern === 'panels') {
    // side panels from armpit to ankle, a yoke across the shoulders
    if (part === 'torso' && a > 62 && a < 118 && h > 0.86) col = D.col2;
    if (part === 'torso' && h > 1.33 && a > 30) col = D.col2;
    if (part === 'arm' && h > -0.14 && Math.abs(deg) < 70) col = D.col2;
    if (part === 'leg' && a > 70 && a < 110 && h > -0.8) col = D.col2;
    // accent piping on the panel edges
    const edge = (part === 'torso' && (Math.abs(a - 62) < 1 || Math.abs(a - 118) < 1) && h > 0.86 && h < 1.33)
      || (part === 'leg' && (Math.abs(a - 70) < 0.9 || Math.abs(a - 110) < 0.9) && h > -0.8);
    if (edge) return band(D.col3, 1, x, y);
  }
  let c = neo(col, x, y, k);
  // blind-stitched seams: thin darker lines with dashed stitch texels
  const seam = part === 'torso' ? (Math.abs(a - 62) < 0.8 || Math.abs(a - 118) < 0.8 || Math.abs(h - 1.33) < 0.003) : part === 'leg' ? Math.abs(a - 180) < 1 : Math.abs(a - 180) < 1.2;
  if (seam) c = (y + x) % 3 ? shade(c, 0.72) : shade(c, 1.2);
  return c;
}

function paintSuit(P: Px, L: Look, D: DiveKit, S: Shape) {
  // ---------------- torso: suit, back zip, chest panel sheen, BCD, belt
  fillReg(P, 'TORSO', (u, v, x, y) => {
    const deg = DEG(u), a = Math.abs(deg), h = lerpR(VMAP.TORSO, v);
    let k = 1 - 0.1 * gauss(h, 1.36, 0.04) * gauss(a, 90, 22) - 0.06 * gauss(h, 0.98, 0.03);
    // a wet sheen down the chest
    if (D.suit === 'wetsuit') k += 0.1 * gauss(a, 20, 14) * gauss(h, 1.24, 0.06) * (hh(x >> 1, y >> 1, 9) > 0.3 ? 1 : 0.6);
    let c = suitPx(D, x, y, 'torso', deg, h, k);
    if (D.suit === 'wetsuit') {
      // back zip (deg 180) with teeth and a long pull strap
      if (a > 176.5 && h > 0.98 && h < 1.44) c = (y & 1) ? metal([60, 62, 66], x, y, 1.1) : band([24, 24, 26], 1, x, y);
      if (a > 175 && a < 179 && h > 0.86 && h < 0.98) c = band(D.col3, 0.9 + (y % 4 === 0 ? -0.2 : 0), x, y);
      // maker's print on the chest
      if (deg > 14 && deg < 34 && h > 1.29 && h < 1.31 && hh(x, 0, 3) > 0.35) c = band(D.col3, 1.05, x, y);
    } else {
      // the Mark V's lacing at the back and a sewn-on patch on the belly
      if (a > 172 && h > 0.92 && h < 1.3 && (y % 5 < 2) && Math.abs(a - 176) < 3) c = band([200, 186, 150], 1, x, y);
      if (deg > -30 && deg < 10 && h > 1.02 && h < 1.12) {
        const pe = Math.min(Math.abs(deg + 30), Math.abs(deg - 10)) < 1 || Math.abs(h - 1.02) < 0.003 || Math.abs(h - 1.12) < 0.003;
        c = pe ? ((x + y) % 2 ? shade(D.col2, 0.6) : shade(D.col2, 1.1)) : twill(D.col2, x, y, 1, 9);
      }
    }
    // BCD jacket: a black wing over the back, a cummerbund round the waist, shoulder straps and a chest strap
    if (D.bcd) {
      const wing = a > 110 && h > 1.0 && h < 1.42;
      const cumm = h > 1.0 && h < 1.1;
      const strap = h > 1.1 && h < 1.45 && Math.abs(a - 35) < 7;
      const chestStrap = Math.abs(h - 1.26) < 0.011 && a < 40;
      const pocket = h > 1.0 && h < 1.09 && Math.abs(a - 70) < 16;
      if (wing || cumm || strap || chestStrap) {
        const bc: RGB = [26, 27, 30];
        c = band(bc, 0.95 + (nz(x, y, 6, 21) - 0.5) * 0.14 + (pocket ? 0.12 : 0), x, y, 0.08);
        if (pocket && (Math.abs(a - 54) < 1 || Math.abs(a - 86) < 1 || Math.abs(h - 1.09) < 0.003)) c = band(bc, 0.6, x, y);
        if (chestStrap && a < 3) c = metal([150, 150, 156], x, y, 1.1);
        if ((strap || cumm) && D.cross) c = band(mix(bc, [200, 200, 196], 0.08), 1, x, y);
        // the medic's red cross on the jacket's back
        if (D.cross && a > 150 && Math.abs(h - 1.28) < 0.06) {
          const cx = (180 - a) / 30, cy = (h - 1.28) / 0.06;
          if ((Math.abs(cx) < 0.32 || Math.abs(cy) < 0.32) && Math.abs(cx) < 0.95 && Math.abs(cy) < 0.95) c = band(D.col3, 1, x, y);
          else if (Math.abs(cx) < 1.05 && Math.abs(cy) < 1.05) c = band([232, 230, 224], 1, x, y);
        }
      }
    }
    // weight belt: webbing, lead blocks, a stainless buckle
    if (D.belt && h > 0.935 && h < 0.985) {
      c = band([20, 20, 22], 0.92 + ((x + y) % 2 ? 0.06 : 0), x, y);
      for (const bd of [-130, -60, 60, 130]) if (Math.abs(deg - bd) < 11) c = metal([92, 94, 98], x, y, 0.85 + (Math.abs(h - 0.96) < 0.012 ? 0.15 : -0.05));
      if (a < 8) c = metal([196, 198, 204], x, y, a < 5 && Math.abs(h - 0.96) < 0.01 ? 0.75 : 1.15);
    }
    return c;
  });
  // ---------------- neck: the hood's bib or the canvas suit's collar
  fillReg(P, 'NECK', (u, v, x, y) => (D.hood ? neo(D.col, x, y, 0.9 + v * 0.1) : D.suit === 'canvas' ? twill(D.col2, x, y, 0.9) : skinPx(L, x, y, 0.95, 0.05)));
  // ---------------- arms
  for (const key of ['ARM_L', 'ARM_R'] as const) {
    const left = key === 'ARM_L';
    fillReg(P, key, (u, v, x, y) => {
      const deg = DEG(u), ay = lerpR(VMAP.ARM, v);
      let k = 1 - 0.1 * gauss(ay, -0.29, 0.03) * gauss(Math.abs(deg), 0, 50);
      if (D.suit === 'wetsuit') k += 0.08 * gauss(deg, left ? 70 : -70, 25) * gauss(ay, -0.15, 0.08);
      let c = suitPx(D, x, y, 'arm', deg, ay, k);
      // elbow pads, wrist seals / rubber cuffs, gloves
      if (D.suit === 'wetsuit' && Math.abs(ay + 0.3) < 0.035 && Math.abs(Math.abs(deg) - 180) < 50) c = pad(shade(D.col, 0.9), x, y);
      if (ay < -0.455 && ay > -0.485) c = D.suit === 'canvas' ? band([24, 22, 22], 0.9 + (y & 1) * 0.1, x, y) : neo(shade(D.col, 0.8), x, y, 1);
      if (ay < -0.485) c = neo(L.hands.col, x, y, 0.95);
      // squad number / shoulder flash
      if (!left && ay > -0.12 && ay < -0.04 && Math.abs(deg - 90) < 30) {
        if (D.cross) {
          const cx = (deg - 90) / 18, cy = (ay + 0.08) / 0.03;
          if (Math.abs(cx) < 1 && Math.abs(cy) < 1) c = (Math.abs(cx) < 0.33 || Math.abs(cy) < 0.33) ? band(D.col3, 1, x, y) : band([232, 230, 224], 1, x, y);
        } else if (Math.abs(deg - 90) < 14 && Math.abs(ay + 0.08) < 0.025) c = band(D.suit === 'canvas' ? [120, 30, 30] : D.col3, 0.9 + ((x * 7 + y * 3 + D.num) % 5 === 0 ? 0.3 : 0), x, y);
      }
      return c;
    });
  }
  // ---------------- hands (gloves)
  for (const key of ['HAND_L', 'HAND_R'] as const) fillReg(P, key, (u, v, x, y) => (D.suit === 'canvas' ? band(L.hands.col, 0.9 + (nz(x, y, 5, 23) - 0.5) * 0.2, x, y) : neo(L.hands.col, x, y, 1 - (v < 0.5 ? 0.06 : 0), 24)));
  // ---------------- legs: knee pads, a knife strapped to the right calf, the canvas suit's lacing
  for (const key of ['LEG_L', 'LEG_R'] as const) {
    const right = key === 'LEG_R';
    fillReg(P, key, (u, v, x, y) => {
      const deg = DEG(u), a = Math.abs(deg), ly = lerpR(VMAP.LEG, v);
      if (ly < S.bootTop) {
        if (L.feet.kind === 'lead') return band([58, 46, 34], 0.9 + (nz(x, y, 5, 25) - 0.5) * 0.25 + (Math.abs(ly - S.bootTop) < 0.012 ? 0.2 : 0), x, y);
        return neo([24, 24, 26], x, y, 0.95);
      }
      let c = suitPx(D, x, y, 'leg', deg, ly, 1 - 0.1 * gauss(ly, -0.46, 0.03) * gauss(a, 180, 40));
      if (D.suit === 'wetsuit' && Math.hypot(deg * 0.0016, ly + 0.45) < 0.06) c = pad(D.pattern === 'camo' ? shade(D.col, 0.8) : [44, 46, 50], x, y);
      if (D.suit === 'canvas' && Math.hypot(deg * 0.0016, ly + 0.45) < 0.07) c = twill(D.col2, x, y, 0.95, 11);
      if (D.knife && right && ly < -0.55 && ly > -0.74) {
        // sheath on the outside of the calf, two rubber straps round it
        const strap = Math.abs(ly + 0.6) < 0.012 || Math.abs(ly + 0.7) < 0.012;
        if (strap) c = band([30, 30, 32], 0.9 + (x & 1) * 0.1, x, y);
        else if (Math.abs(deg + 70) < 14) c = band(ly > -0.6 ? [230, 190, 30] : [34, 34, 36], 0.95 + (Math.abs(deg + 70) > 11 ? -0.2 : 0), x, y);
      }
      // faded maker's print down the left thigh
      if (!right && D.suit === 'wetsuit' && D.pattern !== 'camo' && Math.abs(deg - 85) < 4 && ly < -0.05 && ly > -0.3 && hh(0, y >> 1, 5) > 0.3) c = band(D.col3, 0.85, x, y);
      return c;
    });
  }
  // ---------------- feet
  for (const key of ['FOOT_L', 'FOOT_R'] as const) {
    fillReg(P, key, (u, v, x, y) => {
      const aa = Math.abs((u - 0.5) * 360), sole = aa > 89;
      if (L.feet.kind === 'lead') {
        if (sole) return metal([70, 72, 76], x, y, 0.8 + (y % 3 === 0 ? -0.15 : 0));
        if (v > 0.5 && aa < 80) return metal([176, 128, 56], x, y, 1 + (nz(x, y, 6, 27) > 0.7 ? -0.25 : 0)); // brass toe cap
        if (Math.abs(v - 0.3) < 0.04) return band([40, 30, 22], 1, x, y);                                    // strap
        return band([66, 52, 40], 0.9 + (nz(x, y, 6, 26) - 0.5) * 0.25, x, y);
      }
      if (sole) return band([66, 66, 70], (y % 2 === 0 && aa > 120) ? 0.75 : 1, x, y);
      return neo([24, 24, 26], x, y, 1 - (v > 0.6 ? 0.05 : 0), 28);
    });
  }
}

/** the hood (HEAD region): neoprene outside the face oval, a rolled face seal, the mask strap */
function paintHood(P: Px, L: Look, D: DiveKit) {
  const Fl = faceLayout(L);
  fillReg(P, 'HEAD', (u, v, x, y) => {
    const deg = (u - 0.5) * 360, a = Math.abs(deg), hy = lerpR(VMAP.HEAD, v);
    const o = hoodOval(hy, deg);
    if (o < 1) return null;
    let c = neo(D.col, x, y, 0.95 + 0.08 * gauss(hy, 0.17, 0.03));
    if (o < 1.12) c = neo(shade(D.col, 1.25), x, y, 1);     // the rolled face seal
    if (a > 177 && hy > 0.0) c = (y % 3) ? shade(c, 0.75) : c; // seam over the crown
    // mask strap round the back of the head (silicone, with a buckle near the mask skirt)
    if (D.mask !== 'none' && D.mask !== 'brass' && a > 52 && Math.abs(hy - (Fl.eyeY + 0.008 + (a - 52) * 0.00012)) < 0.011) {
      c = band(D.mask === 'free' || D.mask === 'commando' ? [22, 22, 24] : D.col2, 0.95 + (Math.abs(hy - Fl.eyeY - 0.008 - (a - 52) * 0.00012) > 0.008 ? -0.2 : 0), x, y);
      if (Math.abs(a - 64) < 3) c = metal([150, 150, 156], x, y);
    }
    return c;
  });
}

// ------------------------------------------------------------------ nemesis scars
/** paint scars over a finished page: burns, bandages, bite marks, stitched cuts */
export function paintScars(P: Px, L: Look) {
  const sc = L.scars ?? [];
  if (!sc.length) return;
  const D = L.dive;
  const has = (s: string) => sc.includes(s);
  const blood: RGB = [120, 18, 16];
  const reg = (key: RegKey, fn: (u: number, v: number, x: number, y: number, c: RGB) => RGB | null) => {
    fillReg(P, key, (u, v, x, y) => { const i = (y * P.w + x) * 4; return fn(u, v, x, y, [P.d[i], P.d[i + 1], P.d[i + 2]]); });
  };
  if (has('burns')) {
    // a blistered, glossy burn up the left side of the face, the hood melted and crusted round it
    reg('HEAD', (u, v, x, y, c) => {
      const deg = (u - 0.5) * 360, hy = lerpR(VMAP.HEAD, v);
      const m = nz(x, y, 9, 61) * 0.6 + gauss(deg, 48, 40) * gauss(hy, 0.08, 0.06) * 0.9;
      if (m < 0.62) return null;
      const t = clamp01((m - 0.62) * 3);
      const burnt: RGB = hh(x, y, 62) > 0.6 ? [70, 30, 26] : mix([196, 96, 86], [236, 170, 150], nz(x, y, 4, 63));
      return band(mix(c, burnt, 0.45 + 0.5 * t), 0.95 + (hh(x, y, 64) > 0.92 ? 0.3 : 0), x, y);
    });
    reg('ARM_L', (u, v, x, y, c) => {
      const ay = lerpR(VMAP.ARM, v);
      const m = nz(x, y, 8, 65) + gauss(ay, -0.35, 0.08) * 0.4;
      if (m < 0.82) return null;
      return band(mix(c, hh(x, y, 66) > 0.5 ? [60, 30, 24] : [180, 90, 74], 0.7), 1, x, y);
    });
  }
  if (has('bandage')) {
    // a grubby gauze wrap round the head (over the hood) with a seeping spot, and one round the left forearm
    const gauze = (x: number, y: number, k = 1): RGB => band(mix([226, 220, 204], [190, 176, 150], nz(x, y, 6, 67) * 0.6), k * ((x + y * 2) % 4 === 0 ? 0.88 : 1), x, y, 0.06);
    reg('HEAD', (u, v, x, y) => {
      const deg = (u - 0.5) * 360, hy = lerpR(VMAP.HEAD, v);
      const yl = 0.15 + Math.sin((deg * Math.PI) / 180) * 0.012;
      if (Math.abs(hy - yl) > 0.016 && !(Math.abs(deg + 30) < 9 && hy > 0.12 && hy < 0.2)) return null;
      let c = gauze(x, y);
      if (Math.hypot((deg - 30) * 0.0016, hy - yl) < 0.012) c = mix(c, blood, 0.6 + nz(x, y, 3, 68) * 0.3);
      return c;
    });
    reg('ARM_L', (u, v, x, y) => {
      const ay = lerpR(VMAP.ARM, v);
      if (ay > -0.36 || ay < -0.45) return null;
      let c = gauze(x, y, Math.abs(((ay + 0.36) * 120) % 1 - 0.5) < 0.1 ? 0.82 : 1);
      if (Math.abs(ay + 0.4) < 0.015 && Math.abs(DEG(u) - 20) < 30) c = mix(c, blood, 0.5);
      return c;
    });
  }
  if (has('bite')) {
    // a crescent of tooth punctures torn through the suit on the right upper arm and the left thigh
    const bite = (key: RegKey, vr: readonly number[], cy: number) => reg(key, (u, v, x, y, c) => {
      const deg = DEG(u), h = lerpR(vr, v);
      const dx = deg * 0.0016, dy = h - cy;
      const r = Math.hypot(dx, dy * 1.2);
      if (r > 0.07) return null;
      const ang = Math.atan2(dy, dx);
      const ring = Math.abs(r - 0.05);
      if (ring < 0.008 && Math.sin(ang * 9) > 0.2) return band([60, 12, 12], 1, x, y);      // punctures
      if (r < 0.042 && nz(x, y, 4, 69) > 0.55) return band(mix(skinPx(L, x, y, 0.9, 0.5), [150, 40, 36], 0.5), 1, x, y); // torn: skin + blood
      if (ring < 0.014) return mix(c, [100, 20, 18], 0.35);
      return null;
    });
    bite('ARM_R', VMAP.ARM, -0.12);
    bite('LEG_L', VMAP.LEG, -0.2);
  }
  if (has('stitches')) {
    reg('HEAD', (u, v, x, y, c) => {
      const deg = (u - 0.5) * 360, hy = lerpR(VMAP.HEAD, v);
      const d = (deg + 12) * 0.0016 * 0.7 - (hy - 0.09);
      if (Math.abs(d) > 0.004 || hy < 0.03 || hy > 0.15 || deg > 10 || deg < -45) return null;
      if (Math.abs(d) < 0.0016) return band([110, 40, 44], 1, x, y);
      return (x % 3 === 0) ? band([30, 24, 22], 1, x, y) : mix(c, [190, 120, 110], 0.4);
    });
  }
  void D;
}

/** overpaint a diver's page (only when the look has a dive kit) */
export function paintDive(P: Px, L: Look, S: Shape) {
  const D = L.dive;
  if (!D) return;
  paintSuit(P, L, D, S);
  if (D.hood) paintHood(P, L, D);
}
