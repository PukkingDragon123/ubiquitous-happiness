// Fabrics, rubber, skin, fish scales and gore. These wrap models (people, divers, fish), so their features
// are sized in pixels (a thread = 1 px, a scale ~5 px) rather than metres.
import { Surf, pal, mixc, scl, clamp01, smooth, hex, type RGB } from './core';

// ------------------------------------------------------------------------------------------------ fabrics
/** plain / basket weave: warp threads along y, weft along x, each crossing shaded as a little pillow */
function weave(s: Surf, P: RGB[], o: { cell: number; twill?: number; slub?: number; warpBias?: number; weftCol?: RGB[] }) {
  const c = o.cell;
  s.each((x, y) => {
    const cx = Math.floor(x / c), cy = Math.floor(y / c);
    const fx = (x % c + 0.5) / c, fy = (y % c + 0.5) / c;
    const over = o.twill ? ((cx + cy * (o.twill > 0 ? 1 : -1)) % 4 + 4) % 4 < 3 : ((cx + cy) & 1) === 0; // warp on top?
    // pillow shading across the thread on top
    const across = over ? Math.sin(fx * Math.PI) : Math.sin(fy * Math.PI);
    const along = over ? Math.sin(fy * Math.PI) * 0.3 + 0.7 : Math.sin(fx * Math.PI) * 0.3 + 0.7;
    const slub = (over ? s.na(x, y, 64, 3, 2, 1) : s.na(x, y, 3, 64, 2, 2)) - 0.5;
    const n = s.n(x, y, 3, 3, 3);
    const pal_ = !over && o.weftCol ? o.weftCol : P;
    const t = 0.2 + across * along * 0.5 + slub * (o.slub ?? 0.4) + (n - 0.5) * 0.3 + (over ? o.warpBias ?? 0 : 0);
    s.set(x, y, s.pick(pal_, t, x, y, 0.6));
    s.setH(x, y, 0.3 + across * along * 0.5);
    s.R(x, y, 0.95);
  });
}

export function cotton(s: Surf) {
  weave(s, pal('#6e6a64', '#86827a', '#9c9890', '#b0aca4', '#c2beb6', '#d2cec6'), { cell: 1, slub: 0.5 });
  s.grime(hex('#7a7060'), 0.5, 3, 0.6, 1);
  s.stain(s.w * 0.3, s.h * 0.6, s.w * 0.12, hex('#8a7a5a'), hex('#6a5a40'), 3, 0.18);
  s.bump = 1.5;
}

const INDIGO = pal('#0e131e', '#141b2c', '#1a243a', '#212e4a', '#2a395a', '#36476a', '#4a5a7c');
export function denim(s: Surf) {
  // 3/1 twill: indigo warp shows on the face as diagonal wales; the white weft peeks through
  weave(s, INDIGO, { cell: 1, twill: 1, slub: 0.7, weftCol: pal('#3e4456', '#4e5466', '#5e6476') });
  // fading: lighter wear patches and whiskers, darker in creases
  s.each((x, y) => {
    const fade = s.n(x, y, 2, 3, 20);
    if (fade > 0.58) s.blend(x, y, hex('#5a6a88'), (fade - 0.58) * 0.8);
    const vs = s.na(x, y, 32, 2, 2, 21); // vertical slubs
    if (vs > 0.7) s.blend(x, y, hex('#6a7894'), 0.2);
  });
  s.grime(hex('#1a1e28'), 0.4, 3, 0.65, 2);
  s.bump = 1.5;
}

/** stockinette knit: columns of V stitches, fuzzy heathered wool (`tint` recolours it) */
export function wool(s: Surf, tint?: string) {
  const base = hex(tint ?? '#4a4c56');
  const P = [scl(base, 0.45), scl(base, 0.62), scl(base, 0.8), base, mixc(base, hex('#c8c8c8'), 0.15), mixc(base, hex('#e0e0e0'), 0.3)];
  s.each((x, y) => {
    const sx = 4, sy = 3;
    const col = Math.floor(x / sx), fx = (x % sx + 0.5) / sx, fy = ((y + (col & 1) * 0) % sy + 0.5) / sy;
    // each stitch: two legs leaning in, forming a V
    const leg = fx < 0.5 ? Math.abs(fx - 0.25 - (fy - 0.5) * 0.25) : Math.abs(fx - 0.75 + (fy - 0.5) * 0.25);
    const lit = clamp01(1 - leg * 4.5) * (0.7 + 0.3 * Math.sin(fy * Math.PI));
    const heather = s.r(x, y, 2);
    const t = 0.12 + lit * 0.6 + (heather - 0.5) * 0.35 + (s.n(x, y, 3, 3, 3) - 0.5) * 0.2;
    s.set(x, y, s.pick(P, t, x, y, 0.5));
    s.setH(x, y, 0.2 + lit * 0.6);
    s.R(x, y, 1);
  });
  s.speckle([P[5], P[4], P[1]], 0.03, 4); // fuzz / pilling
  s.bump = 2.5;
}

export function canvas(s: Surf) {
  // heavy 2x2 basket weave, khaki duck canvas
  weave(s, pal('#4a4432', '#5c5540', '#6e664e', '#80785e', '#928a6e', '#a49c80', '#b4ad92'), { cell: 2, slub: 0.3 });
  s.grime(hex('#3a3426'), 0.55, 3, 0.58, 1);
  s.stain(s.w * 0.65, s.h * 0.3, s.w * 0.15, hex('#4a4030'), hex('#3a3022'), 5, 0.2);
  s.drips(hex('#4a3a28'), 3, s.h * 0.5, 0.2, 6);
  s.bump = 2;
}

const LEATHER = pal('#1e120a', '#2c1a0e', '#3c2414', '#4e301c', '#603c24', '#74482c', '#885836', '#9c6a44');
export function leather(s: Surf, tint?: string) {
  const P = tint ? LEATHER.map((c, i) => mixc(c, scl(hex(tint), 0.3 + i * 0.12), 0.6)) : LEATHER;
  s.each((x, y) => {
    const [f1, f2] = s.wor(x, y, s.w / 3, 1);
    const pebble = smooth(0, 1.6, f2 - f1);
    const n = s.n(x, y, 3, 3, 2);
    const t = 0.28 + pebble * 0.12 + n * 0.42 + (s.r(x, y, 3) - 0.5) * 0.1;
    s.set(x, y, s.pick(P, t, x, y, 0.8));
    s.setH(x, y, 0.4 + pebble * 0.25);
    s.R(x, y, 0.5 + (1 - pebble) * 0.25);
  });
  // creases and scuffs
  for (let k = 0; k < 4; k++) s.crack(s.r(k, 1, 10) * s.w, s.r(k, 2, 10) * s.h, s.w * 0.4, 1, (s.r(k, 3, 10) - 0.5) * 0.6, P[0], P[5], 0.25, 0.2, k);
  s.grime(P[6], 0.5, 4, 0.66, 3, 0.8); // dry scuffed patches
  s.cavity(P[0], 0.4, 1, 0.12);
  s.bump = 2;
}

// ------------------------------------------------------------------------------------------------ rubber
/** wetsuit neoprene: near-black, fine dimpled nylon-backed texture, glued + blind-stitched panel seams */
export function neoprene(s: Surf, tint?: string) {
  const P = pal('#0b0c0e', '#111316', '#171a1e', '#1e2227', '#262b31', '#30363d');
  const accent = tint ? hex(tint) : null;
  s.each((x, y) => {
    const d = s.wor(x, y, s.w / 2, 1, 0.8)[0];
    const n = s.n(x, y, 3, 3, 2);
    const t = 0.25 + (d / 2) * 0.3 + n * 0.3 + (s.r(x, y, 3) - 0.5) * 0.1;
    s.set(x, y, s.pick(P, t, x, y, 0.6));
    s.setH(x, y, 0.4 + d * 0.15);
    s.R(x, y, 0.55 + n * 0.15);
    // a coloured panel band (wetsuits often have one)
    if (accent && y > s.h * 0.62 && y < s.h * 0.8) s.set(x, y, mixc(s.pick(P, t, x, y), accent, 0.65));
  });
  // seams: a ridge with stitch dashes either side
  for (const sx of [Math.round(s.w * 0.3), Math.round(s.w * 0.78)]) for (let y = 0; y < s.h; y++) {
    s.set(sx, y, P[4]); s.addH(sx, y, 0.25); s.set(sx + 1, y, P[0]);
    if (y % 3 === 0) { s.set(sx - 2, y, P[5]); s.set(sx + 3, y, P[5]); }
  }
  s.grime(hex('#3a3a36'), 0.35, 4, 0.68, 4, 0.8); // salt crust
  s.bump = 2;
}

export function rubber(s: Surf) {
  const P = pal('#0f0f0f', '#161616', '#1e1e1e', '#272727', '#313131', '#3c3c3c');
  s.each((x, y) => {
    const n = s.n(x, y, 3, 3, 1);
    const ridge = Math.sin((y / s.h) * Math.PI * 2 * 8) > 0.6 ? 0.18 : 0; // moulded ribs
    s.set(x, y, s.pick(P, 0.3 + n * 0.35 + ridge + (s.r(x, y, 2) - 0.5) * 0.1, x, y, 0.6));
    s.setH(x, y, 0.4 + ridge * 2);
    s.R(x, y, 0.72);
  });
  s.grime(hex('#5a564a'), 0.4, 4, 0.64, 2, 0.95); // dust / dried salt
  for (let k = 0; k < 6; k++) { let x = s.r(k, 1, 9) * s.w, y = s.r(k, 2, 9) * s.h; const a = s.r(k, 3, 9) * 6.28; for (let i = 0; i < 6; i++) { s.blend(x, y, hex('#4a4a4a'), 0.6); x += Math.cos(a); y += Math.sin(a); } }
  s.bump = 2;
}

// ------------------------------------------------------------------------------------------------ skin
export const SKIN_TONES: Record<string, string[]> = {
  skinPale: ['#7e5c4e', '#9c7464', '#b88c7a', '#cea290', '#dcb6a2', '#e8c8b6'],
  skinFair: ['#704a3a', '#8e604c', '#aa7862', '#c08e76', '#d2a28a', '#e0b69e'],
  skinTan: ['#5c3a28', '#784c34', '#925e42', '#a87050', '#bc8460', '#cc9872'],
  skinBrown: ['#38200f', '#4a2a16', '#5e3620', '#72442a', '#865436', '#9a6644'],
  skinDark: ['#1e110a', '#28170e', '#341e14', '#42271a', '#523224', '#643e2e'],
};
/** human skin: mottled tone, warm redness zones, pores, a few moles / freckles (fair tones), faint veins */
export function skin(s: Surf, tone: string) {
  const P = pal(...(SKIN_TONES[tone] ?? SKIN_TONES.skinFair));
  const red = hex('#b4504a');
  s.each((x, y) => {
    const n = s.n(x, y, 3, 3, 1), m = s.n(x, y, 8, 2, 2);
    const t = 0.46 + (n - 0.5) * 0.22 + (m - 0.5) * 0.1 + (s.r(x, y, 3) - 0.5) * 0.08;
    let c = s.pick(P, t, x, y, 0.5);
    const rz = s.n(x, y, 2, 3, 4);
    if (rz > 0.6) c = mixc(c, mixc(c, red, 0.2), clamp01((rz - 0.6) * 5));
    s.set(x, y, c);
    s.setH(x, y, 0.5 + (m - 0.5) * 0.06);
    s.R(x, y, 0.55 + (n - 0.5) * 0.2);
  });
  // pores (tiny darker dots) and fine creases
  for (let k = 0; k < (s.w * s.h) / 22; k++) { const x = s.r(k, 1, 10) * s.w, y = s.r(k, 2, 10) * s.h; s.blend(x, y, P[1], 0.35); s.addH(x, y, -0.05); }
  const fair = tone === 'skinPale' || tone === 'skinFair';
  for (let k = 0; k < (fair ? 18 : 4); k++) { const x = s.r(k, 1, 20) * s.w, y = s.r(k, 2, 20) * s.h; s.set(x, y, scl(P[1], fair ? 1.05 : 0.8)); }
  if (fair) s.grime(hex('#8a7a8c'), 0.25, 3, 0.7, 5); // faint blue veins under thin skin
  s.bump = 1;
}

// ------------------------------------------------------------------------------------------------ scales
interface ScaleOpts { P: RGB[]; edge: RGB; irid?: RGB[]; metal?: number; rough?: number; size?: number; reticulate?: number }
/** imbricate fish scales: overlapping rows (offset every other row), each scale lit along its exposed rim */
function scales(s: Surf, o: ScaleOpts) {
  const sw = o.size ?? 6, sh = Math.round((o.size ?? 6) * 0.75);
  s.each((x, y) => {
    // scales point toward -x (head to the left); rows offset by half a scale
    const row = Math.floor(y / sh);
    const off = (row & 1) * sw * 0.5;
    const col = Math.floor((x + off) / sw);
    const fx = ((x + off) % sw) / sw, fy = (y % sh) / sh;
    // the exposed part of each scale is an arc: distance to the posterior rim
    const dx = 1 - fx, dy = (fy - 0.5) * 1.3;
    const d = Math.sqrt(dx * dx * 0.9 + dy * dy);
    const sid = s.r(col, row, 1);
    const n = s.n(x, y, 3, 3, 2);
    let t = 0.35 + (1 - d) * 0.3 + (sid - 0.5) * 0.25 + (n - 0.5) * 0.3;
    let c: RGB;
    if (d > 0.88) { c = o.edge; t -= 0.2; } else c = s.pick(o.P, t, x, y, 0.7);
    if (o.reticulate && d > 0.78 && d <= 0.88) c = mixc(c, o.edge, o.reticulate);
    if (o.irid && sid > 0.72 && d < 0.8) c = mixc(c, o.irid[Math.floor(sid * 97) % o.irid.length], 0.45);
    s.set(x, y, c);
    s.setH(x, y, 0.3 + (1 - d) * 0.5);
    s.R(x, y, o.rough ?? 0.35);
    if (o.metal) s.M(x, y, d > 0.88 ? 0 : o.metal);
  });
  s.bump = 2.5;
}
export function scalesSilver(s: Surf) {
  scales(s, { P: pal('#3a4248', '#56606a', '#76828c', '#98a4ac', '#b8c2c8', '#d8e0e4'), edge: hex('#2a3036'), irid: pal('#8ab8c8', '#a898c8', '#98c8a8'), metal: 0.55, rough: 0.28 });
}
export function scalesGold(s: Surf) {
  scales(s, { P: pal('#5a3a10', '#7e5216', '#a26e1e', '#c08c2c', '#d8a840', '#ecc860'), edge: hex('#3e260a'), irid: pal('#f0d890', '#e8a050'), metal: 0.45, rough: 0.3 });
}
export function scalesCarp(s: Surf) {
  scales(s, { P: pal('#2a2612', '#3e381a', '#544a24', '#6c602e', '#84763a', '#9e8e4a'), edge: hex('#1a1608'), reticulate: 0.6, rough: 0.4, size: 7 });
}
export function scalesReef(s: Surf) {
  scales(s, { P: pal('#0c2436', '#14364e', '#1c4c68', '#286482', '#387e9c', '#5498b4'), edge: hex('#081824'), irid: pal('#60c8d8', '#78a8e8', '#4ad8b8'), metal: 0.25, rough: 0.32, size: 5 });
}
/** shark skin: dermal denticles (tiny ridged teeth all pointing tailward), countershading left to the model */
export function sharkSkin(s: Surf) {
  const P = pal('#2e343a', '#3a4148', '#474f57', '#545d66', '#626b74', '#727b84');
  s.each((x, y) => {
    const [f1, f2, id, px, py] = s.wor(x, y, s.w / 2.5, 1, 0.6);
    const ridge = Math.abs(((y - py) * 2 + 0.5) % 2 - 1) < 0.35 ? 0.12 : 0;
    const lit = clamp01(0.5 + (px - x) * 0.07 + ridge * 0.6);
    const n = s.n(x, y, 3, 3, 2);
    s.set(x, y, f2 - f1 < 0.7 ? P[1] : s.pick(P, 0.3 + lit * 0.25 + (n - 0.5) * 0.35 + (id - 0.5) * 0.08, x, y, 0.6));
    s.setH(x, y, 0.4 + (1 - f1 / 2) * 0.3 + ridge);
    s.R(x, y, 0.62);
  });
  s.grime(hex('#22282c'), 0.4, 3, 0.62, 3);
  s.bump = 2;
}

// ------------------------------------------------------------------------------------------------ gore
const MEAT = pal('#2a0608', '#420c0e', '#5c1414', '#761e1c', '#8e2c28', '#a43e36', '#bc5848', '#d0786a');
const FAT = pal('#a8806a', '#bc967e', '#ccac92', '#d8bea4');
/** raw muscle: fibre bundles along x (wavy fascicles with faint connective-tissue seams), fine striation,
 *  thin fat marbling, wet glints. Wet: low roughness. */
export function flesh(s: Surf) {
  s.each((x, y) => {
    const warp = (s.na(x, y, 2, 3, 2, 1) - 0.5) * 7;
    const yy = y + warp;
    const bh = 4.5;
    const band = Math.floor(yy / bh), fy = (yy / bh) - band;
    const tone = (s.r(band, Math.floor((x + s.r(band, 9, 3) * 40) / 22), 4) - 0.5) * 0.22;
    const stri = s.na(x, yy, 6, 40, 2, 5) - 0.5;
    const n = s.n(x, y, 3, 3, 6);
    const round = Math.sin(fy * Math.PI);
    let t = 0.3 + round * 0.25 + tone + stri * 0.25 + (n - 0.5) * 0.3;
    let c = s.pick(MEAT, t, x, y, 0.6);
    s.setH(x, y, 0.4 + round * 0.25 + stri * 0.05);
    s.R(x, y, 0.3 + (1 - round) * 0.15);
    // perimysium: thin pale seams between some bundles, darker grooves between the rest
    if (fy < 0.14) c = s.r(band, 0, 7) < 0.35 ? mixc(c, hex('#c89488'), 0.45) : scl(c, 0.72);
    // fat marbling, sparse
    const mb = s.na(x, y, 3, 5, 3, 8);
    if (Math.abs(mb - 0.5) < 0.014 && s.n(x, y, 3, 2, 9) > 0.5) { c = mixc(s.pick(FAT, 0.3 + s.r(x, y, 10) * 0.5, x, y), c, 0.3); s.addH(x, y, 0.06); }
    s.set(x, y, c);
  });
  // wet glints: short bright strokes along the fibres
  for (let k = 0; k < (s.w * s.h) / 260; k++) {
    const x = Math.floor(s.r(k, 1, 20) * s.w), y = Math.floor(s.r(k, 2, 20) * s.h), L = 2 + Math.floor(s.r(k, 3, 20) * 3);
    for (let i = 0; i < L; i++) s.blend(x + i, y, hex('#e0928a'), 0.6 - i * 0.1);
  }
  s.grime(hex('#2a0406'), 0.5, 3, 0.64, 1, 0.2);
  s.cavity(hex('#1e0305'), 0.35, 1, 0.1);
  s.bump = 2.5;
}
/** mangled tissue: torn meat with dark clotted pockets, ragged fat, a few bone chips, very wet */
export function gore(s: Surf) {
  flesh(s);
  const BONE = pal('#9a8a6e', '#bcae90', '#d6cab0');
  s.each((x, y) => {
    const tear = s.n(x, y, 4, 3, 30);
    if (tear > 0.6) { s.set(x, y, s.pick(MEAT, (tear - 0.6) * 1.0 + (s.r(x, y, 33) - 0.5) * 0.1, x, y)); s.addH(x, y, -0.25); s.R(x, y, 0.12); }
    const fat = s.n(x, y, 5, 2, 31);
    if (fat > 0.76 && fat - 0.76 > s.ct(x, y) * 0.12) { s.set(x, y, s.pick(FAT, s.r(x, y, 32) * 0.7, x, y)); s.addH(x, y, 0.12); s.R(x, y, 0.5); }
  });
  // bone chips: small irregular pale shards with a dark underside
  for (let k = 0; k < 5; k++) {
    const cx = s.r(k, 1, 40) * s.w, cy = s.r(k, 2, 40) * s.h, a = s.r(k, 3, 40) * 3, L = 2 + s.r(k, 4, 40) * 2.5;
    for (let i = -L; i <= L; i++) for (let j = -1; j <= 0; j++) {
      const x = cx + Math.cos(a) * i - Math.sin(a) * j, y = cy + Math.sin(a) * i + Math.cos(a) * j;
      s.set(x, y, BONE[j === 0 ? 2 : 1]); s.addH(x, y, 0.2);
    }
    s.set(cx + 1, cy + 1.5, hex('#2a0606'));
  }
  s.bump = 3;
}
const BLOOD = pal('#140203', '#260406', '#3a070a', '#500c0e', '#681214', '#7e1c1a', '#962a24');
/** blood pool / smear: thick dark centres, thinner brighter film, drying brown edges, glossy */
export function blood(s: Surf) {
  s.each((x, y) => {
    const th = s.n(x, y, 3, 4, 1);
    const n = s.n(x, y, 10, 2, 2);
    const t = 0.15 + (1 - th) * 0.55 + (n - 0.5) * 0.2;
    let c = s.pick(BLOOD, t, x, y, 0.8);
    // drying: brown, matte at the thin edges
    const dry = smooth(0.25, 0.1, th);
    if (dry > s.ct(x, y)) { c = mixc(c, hex('#3a1c12'), 0.6); s.R(x, y, 0.65); } else s.R(x, y, 0.08 + (1 - th) * 0.1);
    s.set(x, y, c);
    s.setH(x, y, 0.4 + th * 0.2);
  });
  s.speckle(pal('#c86a64'), 0.006, 3); // specular glints
  s.bump = 1.5;
}
