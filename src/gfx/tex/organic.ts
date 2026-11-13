// Fabrics, rubber, skin, fish scales and gore, painted as clean regular patterns (weave, knit, scale rows, muscle
// bundles) with 4-6 tone hue-shifted ramps, seams and stitches, and hand-placed details. These wrap models
// (people, divers, fish), so their features are sized in pixels (a thread = 1 px, a scale ~6 px).
import { Surf, hramp, mixc, hex, type RGB } from './core';

// ------------------------------------------------------------------------------------------------ fabrics
/** a stitched seam running down at column x: a dark groove, a lit ridge, dashed thread either side */
function seam(s: Surf, x: number, P: RGB[], thread: RGB) {
  for (let y = 0; y < s.h; y++) {
    s.set(x, y, P[0]); s.set(x + 1, y, P[Math.min(P.length - 1, 3)]); s.addH(x, y, -0.2);
    if (y % 4 < 2) { s.set(x - 2, y, thread); s.set(x + 3, y, thread); }
  }
}

export function cotton(s: Surf) {
  const P = hramp('#b4b0a6', 5, 0.35, 0.02);
  // plain weave: a quiet 2-tone checker of thread crossings inside two broad tone zones
  s.each((x, y) => { s.set(x, y, P[3 - ((x + y) & 1)]); s.setH(x, y, 0.5 + ((x + y) & 1) * 0.1); s.R(x, y, 0.95); });
  seam(s, Math.floor(s.w * 0.7), P, P[1]);
  s.bump = 1.2;
}

export function denim(s: Surf) {
  const P = hramp('#3a4c72', 5, 0.5, 0.02);
  // 3/1 twill: diagonal wales; faded lighter zone (wear); an orange top-stitched seam
  s.each((x, y) => {
    const d = ((x + y) % 4 + 4) % 4;
    s.set(x, y, P[[1, 2, 2, 3][d]]);
    s.setH(x, y, d === 3 ? 0.6 : 0.5);
    s.R(x, y, 0.95);
  });
  seam(s, Math.floor(s.w * 0.3), P, hex('#c8883a'));
  s.bump = 1.5;
}

/** stockinette knit: columns of V stitches (`tint` recolours the wool) */
export function wool(s: Surf, tint?: string) {
  const P = hramp(tint ?? '#5a5c66', 5, 0.5);
  s.each((x, y) => {
    const fx = x % 4, fy = y % 3;
    // each stitch: two legs leaning in -> a V; lit on its upper part
    const leg = fx === 0 || fx === 3 ? (fy === 0 ? 3 : 2) : fx === 1 ? (fy < 2 ? 3 : 2) : (fy === 2 ? 1 : 2);
    s.set(x, y, P[fx === 0 && fy === 2 ? 0 : leg]);
    s.setH(x, y, 0.3 + leg * 0.1);
    s.R(x, y, 1);
  });
  s.bump = 2.5;
}

export function canvas(s: Surf) {
  const P = hramp('#8a8266', 5, 0.45);
  // 2x2 basket weave, two broad tone zones, a stitched hem
  s.each((x, y) => {
    const over = ((x >> 1) + (y >> 1)) & 1;
    const k = over ? ((x & 1) ? 2 : 3) : ((y & 1) ? 1 : 2);
    s.set(x, y, P[k]);
    s.setH(x, y, 0.4 + k * 0.08);
    s.R(x, y, 0.95);
  });
  seam(s, Math.floor(s.w * 0.55), P, P[0]);
  s.bump = 2;
}

export function leather(s: Surf, tint?: string) {
  const P = hramp(tint ?? '#6e4428', 6, 0.55, 0.04);
  // two panels joined by a stitched seam, broad tone zones, a few creases, a scuffed patch
  s.each((x, y) => { s.set(x, y, P[3]); s.setH(x, y, 0.5); s.R(x, y, 0.75); });
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(s.r(k, 1, 2) * s.w), y = Math.floor(s.r(k, 2, 2) * s.h);
    s.crack([[x, y], [x + 5, y + 1], [x + 11, y + 1]], P[2], P[4], 0.1);
  }
  const sx = Math.floor(s.r(5, 1, 3) * s.w), sy = Math.floor(s.r(5, 2, 3) * s.h);
  for (let y = -2; y <= 2; y++) for (let x = -5; x <= 5; x++) if ((x / 5) ** 2 + (y / 2) ** 2 < 1) s.set(sx + x, sy + y, P[4]);
  seam(s, Math.floor(s.w * 0.4), P, hex('#d8c8a0'));
  s.bump = 2;
}

// ------------------------------------------------------------------------------------------------ rubber
/** wetsuit neoprene: near-black panels, glued + blind-stitched seams, an optional coloured accent band */
export function neoprene(s: Surf, tint?: string) {
  const P = hramp('#24282e', 5, 0.55, 0.02);
  const A = tint ? hramp(tint, 4, 0.45) : null;
  s.each((x, y) => {
    s.set(x, y, P[2 - ((x + y * 2) % 5 === 0 ? 1 : 0)]);
    s.setH(x, y, 0.5); s.R(x, y, 0.8);
    if (A && y > s.h * 0.62 && y < s.h * 0.8) s.set(x, y, A[y < s.h * 0.64 ? 3 : y > s.h * 0.78 ? 1 : 2]);
  });
  seam(s, Math.floor(s.w * 0.3), P, P[4]);
  seam(s, Math.floor(s.w * 0.78), P, P[4]);
  s.bump = 2;
}

export function rubber(s: Surf) {
  const P = hramp('#2e2e2e', 5, 0.55, 0);
  // moulded ribs: lit top edge, shadowed bottom edge
  s.each((x, y) => {
    const f = y % 8;
    s.set(x, y, P[f === 0 ? 3 : f === 1 ? 2 : f === 6 ? 1 : f === 7 ? 0 : 2]);
    s.setH(x, y, f < 2 ? 0.7 : f > 5 ? 0.3 : 0.5);
    s.R(x, y, 0.85);
  });
  s.bump = 2;
}

// ------------------------------------------------------------------------------------------------ skin
export const SKIN_TONES: Record<string, string> = {
  skinPale: '#e0b4a0', skinFair: '#c89478', skinTan: '#a87452', skinBrown: '#7e4e34', skinDark: '#4e2e20',
};
/** human skin: nearly flat (two close tones in broad zones), no pores, no noise; a few freckles on fair tones */
export function skin(s: Surf, tone: string) {
  const P = hramp(SKIN_TONES[tone] ?? SKIN_TONES.skinFair, 7, 0.3, 0.03);
  s.each((x, y) => { s.set(x, y, P[3 + s.zone(x, y, 2, 2, 1)]); s.setH(x, y, 0.5); s.R(x, y, 0.75); });
  if (tone === 'skinPale' || tone === 'skinFair') for (let k = 0; k < 5; k++) s.set(Math.floor(s.r(k, 1, 3) * s.w), Math.floor(s.r(k, 2, 3) * s.h), P[1]);
  s.bump = 0.8;
}

// ------------------------------------------------------------------------------------------------ scales
interface ScaleOpts { base: string; edge?: string; irid?: string; size?: number; metal?: number }
/** imbricate fish scales: overlapping rows (offset every other row); each scale a lit arc with a dark rim */
function scales(s: Surf, o: ScaleOpts) {
  const P = hramp(o.base, 5, 0.5);
  const edge = o.edge ? hex(o.edge) : P[0];
  const irid = o.irid ? hramp(o.irid, 3, 0.4) : null;
  const sw = o.size ?? 6, sh = Math.round(sw * 0.75);
  s.each((x, y) => {
    const row = Math.floor(y / sh), off = (row & 1) * sw * 0.5;
    const col = Math.floor((x + off) / sw);
    const fx = (((x + off) % sw) + sw) % sw / sw, fy = (y % sh) / sh;
    const dx = 1 - fx, dy = (fy - 0.5) * 1.3;
    const d = Math.sqrt(dx * dx * 0.9 + dy * dy);
    const pal_ = irid && s.r(col, row, 1) < 0.18 ? irid : P;
    let c: RGB;
    if (d > 0.88) c = edge;
    else if (d > 0.7) c = pal_[Math.min(pal_.length - 1, 1)];
    else c = pal_[fy < 0.45 ? Math.min(pal_.length - 1, 3) : 2];
    if (d < 0.35 && fy < 0.4 && fx > 0.55) c = pal_[pal_.length - 1]; // the glint, painted
    s.set(x, y, c);
    s.setH(x, y, 0.3 + (1 - d) * 0.5);
    s.R(x, y, 0.65);
    if (o.metal) s.M(x, y, d > 0.88 ? 0 : o.metal);
  });
  s.bump = 2.5;
}
export function scalesSilver(s: Surf) { scales(s, { base: '#8e9aa4', irid: '#9ab4c8', metal: 0.2 }); }
export function scalesGold(s: Surf) { scales(s, { base: '#c08c32', edge: '#4a2e0c', metal: 0.2 }); }
export function scalesCarp(s: Surf) { scales(s, { base: '#6e6436', edge: '#1e1a0a', size: 7 }); }
export function scalesReef(s: Surf) { scales(s, { base: '#2e6a8a', edge: '#0a1a28', irid: '#4ab4c4', size: 5 }); }
/** shark skin: smooth grey with fine regular denticle ridges (countershading is left to the model) */
export function sharkSkin(s: Surf) {
  const P = hramp('#5e666e', 5, 0.4, 0.02);
  s.each((x, y) => {
    const ridge = ((x * 2 + y) % 6 === 0) && (y % 3 !== 2);
    s.set(x, y, P[ridge ? 3 : 2 + (s.zone(x, y, 2, 2, 1) ? 0 : -0)]);
    s.setH(x, y, ridge ? 0.6 : 0.5);
    s.R(x, y, 0.8);
  });
  s.bump = 1.5;
}

// ------------------------------------------------------------------------------------------------ gore
const FAT = hramp('#d0b090', 4, 0.4);
/** raw muscle: fibre bundles along x (each a rounded band: lit top, shadowed bottom), pale fascia seams, a thin
 *  fat line, painted wet glints */
export function flesh(s: Surf) {
  const P = hramp('#8e2a26', 6, 0.55, 0.04);
  const bands: number[] = [];
  for (let y = 0; y < s.h;) { bands.push(y); y += 4 + Math.floor(s.r(bands.length, 0, 1) * 3); }
  s.each((x, y) => {
    const wob = Math.round(Math.sin((x / s.w) * Math.PI * 2 + 1.3) * 1.2);
    const yy = ((y + wob) % s.h + s.h) % s.h;
    let b = 0; for (let i = 0; i < bands.length; i++) if (yy >= bands[i]) b = i;
    const top = bands[b], bot = b + 1 < bands.length ? bands[b + 1] : s.h, fy = yy - top, h = bot - top;
    let k = 3 + (s.r(b, 0, 2) < 0.4 ? -1 : 0);
    if (fy === 0) k = s.r(b, 1, 3) < 0.3 ? -1 : 1; // seam: pale fascia or a dark groove
    else if (fy === 1) k += 1;
    else if (fy === h - 1) k -= 1;
    s.set(x, y, k < 0 ? mixc(P[4], hex('#d8b0a0'), 0.4) : P[k]);
    s.setH(x, y, fy === 0 ? 0.3 : 0.6);
    s.R(x, y, 0.7);
  });
  // one thin fat line and wet glints (2-3 px strokes on bundle tops)
  const fy0 = Math.floor(s.r(9, 9, 4) * s.h);
  for (let x = 0; x < s.w; x++) { const y = fy0 + Math.round(Math.sin((x / s.w) * Math.PI * 4) * 2); s.set(x, y, FAT[2]); s.set(x, y + 1, FAT[1]); }
  for (let k = 0; k < Math.round(s.w * s.h / 300); k++) {
    const x = Math.floor(s.r(k, 1, 5) * s.w), b = bands[Math.floor(s.r(k, 2, 5) * bands.length)];
    for (let i = 0; i < 3; i++) s.set(x + i, b + 1, i === 1 ? hex('#f0b8b0') : P[5]);
  }
  s.bump = 2.5;
}
/** mangled tissue: flesh with torn dark pockets (ragged pale rim), fat lumps, bone shards */
export function gore(s: Surf) {
  flesh(s);
  const P = hramp('#5a1414', 4, 0.5);
  const BONE = hramp('#d6cab0', 3, 0.4);
  for (let k = 0; k < 3; k++) {
    const cx = s.r(k, 1, 30) * s.w, cy = s.r(k, 2, 30) * s.h, rx = 3 + s.r(k, 3, 30) * 4, ry = 2 + s.r(k, 4, 30) * 2;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
      if (d < 0.6) { s.set(x, y, P[0]); s.setH(x, y, 0.1); } else if (d < 1) s.set(x, y, y < cy ? P[3] : P[1]);
    }
  }
  for (let k = 0; k < 2; k++) s.ball(s.r(k, 5, 31) * s.w, s.r(k, 6, 31) * s.h, 2.5, 2, FAT, { h: 0.3 });
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(s.r(k, 7, 32) * s.w), y = Math.floor(s.r(k, 8, 32) * s.h);
    s.rect(x, y, 4, 1, BONE[2]); s.rect(x + 1, y + 1, 3, 1, BONE[1]); s.set(x + 4, y + 1, BONE[0]); s.addH(x + 1, y, 0.2);
  }
  s.bump = 3;
}
/** blood pool / smear: clean blobs, dark thick centres, a brighter thin edge, a dried brown rim, painted glints */
export function blood(s: Surf) {
  const P = hramp('#6a1012', 5, 0.55, 0.03);
  const dry = hex('#3e1c12');
  s.each((x, y) => { s.set(x, y, P[1]); s.setH(x, y, 0.45); s.R(x, y, 0.65); });
  for (let k = 0; k < 4; k++) {
    const cx = s.r(k, 1, 20) * s.w, cy = s.r(k, 2, 20) * s.h, r = 6 + s.r(k, 3, 20) * 8;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.4) / r;
      if (d < 0.55) s.set(x, y, P[0]); else if (d < 0.9) s.set(x, y, P[2]); else if (d < 1) s.set(x, y, dry);
      if (d < 1) s.setH(x, y, 0.5 + (1 - d) * 0.1);
    }
    s.set(cx - r * 0.3, cy - r * 0.25, P[4]); s.set(cx - r * 0.3 + 1, cy - r * 0.25, P[3]);
  }
  s.bump = 1.5;
}
