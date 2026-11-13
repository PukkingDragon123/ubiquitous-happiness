// Particles: hand-painted 2D PIXEL-ART sprites on GPU points (many animated: multi-frame atlas strips), plus
// tumbling low-poly 3D chunks (rock / coral / wood debris and textured flesh gibs).
//
//   fx.emit('bubble', x, y, { n: 6, spread: 0.2, vy: 1 })
//   fx.burst('spark', x, y, 12, 4)                 // n particles, speed
//   fx.debrisBurst(x, y, 10, '#8a7f73', 3)         // low-poly chunks
//   fx.splash(x, strength)                         // surface splash: animated crown + droplets above, bubbles below
//   fx.gore(x, y, amount, dir)                     // blood clouds that bloom and drift underwater / droplets in air,
//                                                  //   flesh gib sprites + textured 3D gibs that bleed as they sink
//   fx.bleed(x, y, k)                              // a wisp of blood from a wound (call while bleeding)
//   fx.silt(x, y, n)  fx.smoke(x, y, n)            // sand puffs (underwater) / smoke (in air)
//   fx.explosion(x, y, size)                       // flash light, fireball (or gas bubble underwater), shockwave,
//                                                  //   sparks, smoke, debris
//   fx.magic(x, y, '#7ab8ff', n)                   // mana twinkles (blue / purple / any colour)
//   fx.sparks(x, y, n, dir)  fx.muzzle(x, y, angle, size)  fx.shockwave(x, y, size)
//
// Rendering: sprites are point sprites sampled with nearest filtering from one 512 px atlas, sized in the low
// internal resolution (src/gfx/post.ts), so they stay chunky pixel art. "Hard" sprites write depth (the water
// fog treats them like solids) and use ordered-dither alpha (PS1 stipple translucency) for clouds and fades;
// glows / sparks / magic are additive. Non-glowing sprites are dimmed with water depth like lit surfaces.
// Particles above the water obey gravity; below they get buoyancy + drag; bubbles pop at the surface; blood
// drops that fall into the water turn into clouds.
import * as THREE from 'three';
import { Px, hex, mix, RGB } from './px';
import { clamp01, fbm, hash2 } from '../core/math';
import { UW, uw } from './shaders/underwater';
import { RETRO } from './retro';
import { rigOf, type Lighting } from './lighting';
import { tex } from './tex';

export type PKind =
  | 'bubble' | 'bubbleBig' | 'snow' | 'spark' | 'star' | 'droplet' | 'goo' | 'ink' | 'dust' | 'glow' | 'heart' | 'coin' | 'ember' | 'ring' | 'leaf' | 'zap'
  | 'blood' | 'bloodDrop' | 'gib' | 'sparkPx' | 'silt' | 'smoke' | 'splash' | 'magic' | 'shock' | 'muzzle' | 'explosion' | 'chip' | 'fire';

type Anim = 'still' | 'life' | 'loop' | 'variant';
type RotMode = 'none' | 'random' | 'quarter' | 'orient';
interface SpriteDef { px: number; frames: number; anim: Anim; fps?: number; rot: RotMode; add: boolean; emit?: boolean; unlit?: boolean; life: number; size: number; vy?: number; grav?: number }

// per-kind defaults (size in metres at the gameplay plane; ~35 low-res px per metre)
const DEFS: Record<PKind, SpriteDef> = {
  bubble: { px: 16, frames: 1, anim: 'still', rot: 'none', add: false, life: 3, size: 0.14, vy: 0.4 },
  bubbleBig: { px: 16, frames: 1, anim: 'still', rot: 'none', add: false, life: 3, size: 0.3, vy: 0.4 },
  snow: { px: 16, frames: 1, anim: 'still', rot: 'random', add: false, life: 8, size: 0.04 },
  spark: { px: 16, frames: 1, anim: 'still', rot: 'random', add: true, unlit: true, life: 0.35, size: 0.25 },
  star: { px: 16, frames: 1, anim: 'still', rot: 'random', add: true, unlit: true, life: 1.2, size: 0.2 },
  droplet: { px: 16, frames: 1, anim: 'still', rot: 'none', add: false, life: 1.2, size: 0.2, grav: -9.8 },
  goo: { px: 16, frames: 1, anim: 'still', rot: 'random', add: false, life: 1.2, size: 0.2, grav: -9.8 },
  ink: { px: 16, frames: 1, anim: 'still', rot: 'random', add: false, life: 2.5, size: 0.9 },
  dust: { px: 16, frames: 1, anim: 'still', rot: 'random', add: false, life: 1.2, size: 0.2, grav: -0.3 },
  glow: { px: 16, frames: 1, anim: 'still', rot: 'none', add: true, unlit: true, life: 0.5, size: 0.6 },
  heart: { px: 16, frames: 1, anim: 'still', rot: 'none', add: false, unlit: true, life: 1.2, size: 0.2 },
  coin: { px: 16, frames: 1, anim: 'still', rot: 'none', add: false, unlit: true, life: 1.2, size: 0.2, grav: -9.8 },
  ember: { px: 16, frames: 1, anim: 'still', rot: 'random', add: true, unlit: true, life: 1.2, size: 0.2 },
  ring: { px: 16, frames: 1, anim: 'still', rot: 'none', add: true, unlit: true, life: 1.2, size: 0.2 },
  leaf: { px: 16, frames: 1, anim: 'still', rot: 'random', add: false, life: 1.2, size: 0.2 },
  zap: { px: 16, frames: 1, anim: 'still', rot: 'random', add: true, unlit: true, life: 1.2, size: 0.2 },
  // ---- v2 pixel FX
  blood: { px: 32, frames: 6, anim: 'life', rot: 'quarter', add: false, life: 3.6, size: 0.95 },
  bloodDrop: { px: 8, frames: 3, anim: 'variant', rot: 'orient', add: false, life: 1.4, size: 0.17, grav: -9.8 },
  gib: { px: 16, frames: 6, anim: 'variant', rot: 'random', add: false, life: 2.6, size: 0.38, grav: -9.8 },
  sparkPx: { px: 8, frames: 1, anim: 'still', rot: 'orient', add: true, unlit: true, life: 0.42, size: 0.24, grav: -6 },
  silt: { px: 32, frames: 6, anim: 'life', rot: 'quarter', add: false, life: 2.4, size: 0.95 },
  smoke: { px: 32, frames: 6, anim: 'life', rot: 'quarter', add: false, life: 2.6, size: 1.05 },
  splash: { px: 32, frames: 6, anim: 'life', rot: 'none', add: false, unlit: true, life: 0.55, size: 1.0 },
  magic: { px: 16, frames: 4, anim: 'loop', fps: 12, rot: 'none', add: true, unlit: true, life: 0.9, size: 0.42 },
  shock: { px: 64, frames: 6, anim: 'life', rot: 'none', add: true, unlit: true, life: 0.42, size: 2.2 },
  muzzle: { px: 32, frames: 3, anim: 'life', rot: 'orient', add: true, unlit: true, life: 0.075, size: 0.75 },
  explosion: { px: 64, frames: 8, anim: 'life', rot: 'quarter', add: false, emit: true, life: 0.95, size: 2.0 },
  chip: { px: 8, frames: 4, anim: 'variant', rot: 'random', add: false, life: 1.6, size: 0.16, grav: -9.8 },
  fire: { px: 16, frames: 4, anim: 'loop', fps: 14, rot: 'none', add: false, emit: true, unlit: true, life: 0.6, size: 0.45, vy: 0.6 },
};
const KINDS = Object.keys(DEFS) as PKind[];

// ------------------------------------------------------------------------------------------------ atlas
const AW = 512, AH = 512;
interface Atlas { tex: THREE.Texture; rects: Record<string, Float32Array[]> }
let ATLAS: Atlas | null = null;

/** clustered dither threshold (organic clumps, never a regular checker) for painting */
const clusterT = (x: number, y: number, s: number) => clamp01(0.5 + (fbm(x / 2.6, y / 2.6, 2, s) - 0.5) * 1.8 + (hash2(x >> 1, y >> 1, s + 5) - 0.5) * 0.3);
/** pick a colour from a palette by t with clustered dithering between neighbours */
function pal(cols: RGB[], t: number, x: number, y: number, s = 0): RGB {
  const f = clamp01(t) * (cols.length - 1);
  let i = Math.floor(f);
  if (f - i > clusterT(x, y, s)) i++;
  return cols[Math.min(cols.length - 1, i)];
}
const P = (...c: string[]) => c.map((h) => hex(h));
const smooth01 = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

function buildAtlas(): Atlas {
  const p = new Px(AW, AH);
  const rects: Record<string, Float32Array[]> = {};
  // shelf packer with 1 px gutters
  let sx = 0, sy = 0, shelf = 0;
  const alloc = (w: number, h: number): [number, number] => {
    if (sx + w > AW) { sx = 0; sy += shelf + 1; shelf = 0; }
    const r: [number, number] = [sx, sy];
    sx += w + 1; shelf = Math.max(shelf, h);
    return r;
  };
  // allocate in size order so shelves pack tightly
  const order = [...KINDS].sort((a, b) => DEFS[b].px - DEFS[a].px);
  const origin: Record<string, [number, number][]> = {};
  for (const k of order) {
    const d = DEFS[k];
    origin[k] = [];
    rects[k] = [];
    for (let f = 0; f < d.frames; f++) {
      const [x, y] = alloc(d.px, d.px);
      origin[k].push([x, y]);
      rects[k].push(new Float32Array([x / AW, y / AH, d.px / AW, d.px / AH]));
    }
  }
  const at = (k: PKind, f = 0) => origin[k][f];
  paintClassic(p, at);
  paintV2(p, at);
  const t = p.texture({ mip: false });
  return { tex: t, rects };
}

/** the v1 sprite set (kept: other modules use these kinds) */
function paintClassic(p: Px, at: (k: PKind, f?: number) => [number, number]) {
  const disc = (k: PKind, r: number, fn: (nx: number, ny: number) => RGB | null) => { const [ox, oy] = at(k); p.ellipse(ox + 8, oy + 8, r, r, (nx, ny) => fn(nx, ny)); };
  let [ox, oy] = at('bubble');
  p.ellipse(ox + 8, oy + 8, 5.5, 5.5, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.72 ? [200, 250, 255] : null; });
  p.ellipse(ox + 8, oy + 8, 4.5, 4.5, () => [120, 210, 240], 70);
  p.set(ox + 6, oy + 5, '#ffffff'); p.set(ox + 5, oy + 6, '#ffffff'); p.set(ox + 6, oy + 6, '#e8ffff');
  [ox, oy] = at('bubbleBig');
  p.ellipse(ox + 8, oy + 8, 7.5, 7.5, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.82 ? [210, 250, 255] : null; });
  p.ellipse(ox + 8, oy + 8, 6.5, 6.5, (_nx, ny) => mix([90, 190, 230], [170, 235, 255], clamp01(-ny * 0.5 + 0.3)), 60);
  p.rect(ox + 4, oy + 4, 2, 1, '#ffffff'); p.rect(ox + 4, oy + 5, 1, 2, '#ffffff'); p.set(ox + 11, oy + 11, '#c8f4ff');
  disc('snow', 2.2, () => [235, 245, 240]);
  [ox, oy] = at('spark');
  for (let i = -5; i <= 5; i++) { const a = 255 * (1 - Math.abs(i) / 6); p.set(ox + 8 + i, oy + 8, '#fff6d0', a); p.set(ox + 8, oy + 8 + i, '#fff6d0', a); }
  p.rect(ox + 7, oy + 7, 2, 2, '#ffffff');
  [ox, oy] = at('star');
  p.poly([[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]].map(([x, y]) => [ox + x, oy + y] as [number, number]), (_x, y) => mix(hex('#fff3a0'), hex('#ffb830'), (y - oy) / 16));
  p.set(ox + 7, oy + 5, '#ffffff');
  disc('droplet', 3, (_nx, ny) => mix([200, 245, 255], [90, 190, 230], clamp01(ny * 0.5 + 0.5)));
  disc('goo', 4, (nx, ny) => (nx < -0.2 && ny < -0.2 ? [255, 220, 230] : mix([250, 160, 180], [200, 100, 130], clamp01(ny * 0.5 + 0.5))));
  disc('ink', 7, (nx, ny) => { const d = Math.hypot(nx, ny); return d < 0.9 ? mix([40, 30, 60], [20, 15, 35], d) : null; });
  disc('dust', 2.5, () => [170, 150, 120]);
  [ox, oy] = at('glow');
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8) / 8; if (d < 1) p.set(ox + x, oy + y, [255, 255, 255], Math.max(0, (1 - d) ** 2) * 255); }
  [ox, oy] = at('heart');
  p.poly([[8, 14], [2, 8], [2, 4], [5, 2], [8, 4], [11, 2], [14, 4], [14, 8]].map(([x, y]) => [ox + x, oy + y] as [number, number]), '#ff4d6d');
  p.set(ox + 4, oy + 4, '#ffc0cc'); p.set(ox + 5, oy + 4, '#ffc0cc'); p.set(ox + 4, oy + 5, '#ffc0cc');
  [ox, oy] = at('coin');
  p.ellipse(ox + 8, oy + 8, 5, 6, (nx, ny) => (Math.hypot(nx, ny) > 0.75 ? [184, 120, 30] : mix([255, 230, 120], [230, 160, 40], clamp01(ny * 0.5 + 0.5))));
  p.rect(ox + 7, oy + 5, 1, 6, '#fff7c8');
  disc('ember', 2.5, (nx, ny) => mix([255, 240, 160], [255, 120, 40], Math.hypot(nx, ny)));
  [ox, oy] = at('ring');
  p.ellipse(ox + 8, oy + 8, 7, 7, (nx, ny) => (Math.hypot(nx, ny) > 0.8 ? [230, 255, 255] : null));
  [ox, oy] = at('leaf');
  p.poly([[3, 12], [6, 5], [12, 2], [10, 9]].map(([x, y]) => [ox + x, oy + y] as [number, number]), '#5aa04a');
  p.line(ox + 4, oy + 11, ox + 11, oy + 3, '#8fd06a');
  [ox, oy] = at('zap');
  p.line(ox + 3, oy + 2, ox + 9, oy + 7, '#fffbe0'); p.line(ox + 9, oy + 7, ox + 6, oy + 9, '#fffbe0'); p.line(ox + 6, oy + 9, ox + 13, oy + 14, '#fffbe0');
  p.line(ox + 4, oy + 2, ox + 10, oy + 7, '#9ff2ff');
}

/**
 * A billowing volume (blood cloud, silt, smoke) for one animation frame: overlapping puffs that grow, lit from
 * the upper left, edges eaten away by noise as it thins out. Alpha is quantised to quarter steps so the
 * shader's stipple dither reads as deliberate PS1 translucency.
 */
function volume(p: Px, ox: number, oy: number, S: number, t: number, seed: number, cols: RGB[], o: { grow?: number; thin?: number; wisp?: number; rise?: number; alpha?: number } = {}) {
  const c = S / 2;
  const R = S * 0.5 * (0.3 + (o.grow ?? 0.62) * t);
  const puffs: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = hash2(i, 1, seed) * Math.PI * 2, d = R * (0.2 + hash2(i, 2, seed) * 0.42) * (0.6 + t * 0.6);
    puffs.push([c + Math.cos(a) * d, c + Math.sin(a) * d * 0.85 - (o.rise ?? 0) * t * S * 0.12, R * (0.42 + hash2(i, 3, seed) * 0.3)]);
  }
  puffs.push([c, c, R * 0.62]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let dens = 0, lx = 0, ly = 0;
    for (const [px, py, pr] of puffs) {
      const dx = (x + 0.5 - px) / pr, dy = (y + 0.5 - py) / pr;
      const v = 1 - Math.sqrt(dx * dx + dy * dy);
      if (v > dens) { dens = v; lx = dx; ly = dy; }
    }
    if (dens < -0.25) continue; // far outside every puff: never let noise speckle the empty cell
    const n = fbm((x - c) / Math.max(2, R) * 1.7 + seed * 3.1, (y - c) / Math.max(2, R) * 1.7, 3, seed);
    const rim = 1 - smooth01((Math.hypot(x + 0.5 - c, y + 0.5 - c) / c - 0.78) / 0.22);
    dens = (dens * 1.35 - (n - 0.5) * (0.9 + (o.wisp ?? 0.6) * t) * Math.min(1, dens + 0.6) - t * (o.thin ?? 0.38)) * rim;
    if (dens <= 0.02) continue;
    // ball-lit puff: upper-left faces bright, crevices between puffs dark
    const light = clamp01(0.55 + (-lx - ly) * 0.32 + (dens - 0.4) * 0.35 + (n - 0.5) * 0.3);
    const col = pal(cols, light * (1 - t * 0.25), x + ox, y + oy, seed);
    let a = clamp01(dens * 2.2) * (o.alpha ?? 1) * (1 - t * 0.45);
    a = Math.ceil(a * 4) / 4;
    p.set(ox + x, oy + y, col, a * 255);
  }
}

function paintV2(p: Px, at: (k: PKind, f?: number) => [number, number]) {
  const BLOOD = P('#160204', '#2c0507', '#480a0d', '#661115', '#81191b', '#9a2a26');
  const SILT = P('#2e271e', '#4a3f30', '#695a44', '#8a7758', '#a8956f', '#c0ad86');
  const SMOKE = P('#151517', '#26272a', '#3b3c3f', '#56575a', '#727272', '#8d8c88');
  // blood clouds: dense dark knot -> spreading wispy cloud
  for (let f = 0; f < 6; f++) { const [ox, oy] = at('blood', f); volume(p, ox, oy, 32, f / 5, 11, BLOOD, { grow: 0.66, thin: 0.42, wisp: 0.9 }); }
  for (let f = 0; f < 6; f++) { const [ox, oy] = at('silt', f); volume(p, ox, oy, 32, f / 5, 23, SILT, { grow: 0.62, thin: 0.4, rise: 1 }); }
  for (let f = 0; f < 6; f++) { const [ox, oy] = at('smoke', f); volume(p, ox, oy, 32, f / 5, 37, SMOKE, { grow: 0.64, thin: 0.34, rise: 1.4 }); }

  // blood drops (pointing +x so velocity orientation makes them streak): round, teardrop, long streak
  const DR = P('#2a0406', '#5a0b0e', '#861719', '#b2302c', '#e07a6a');
  for (let f = 0; f < 3; f++) {
    const [ox, oy] = at('bloodDrop', f);
    const len = [0, 1.5, 3][f];
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const dx = x + 0.5 - 5, dy = y + 0.5 - 4;
      const q = dx > 0 ? dx / 1.8 : dx / (1.8 + len);
      const d = Math.sqrt(q * q + (dy / 1.7) ** 2) + (dx < 0 ? -dx * 0.12 : 0);
      if (d > 1) continue;
      p.set(ox + x, oy + y, d > 0.75 ? DR[1] : dy < -0.5 ? DR[3] : DR[2]);
    }
    p.set(ox + 5, oy + 3, DR[4]);
  }

  // flesh gibs: torn meat with marbled fat, a bone end or a skin flap, dark wet outline
  const MEAT = P('#3a0c0c', '#5c1414', '#7e2220', '#9c3a32', '#b85a4c', '#cf8270');
  const FAT = hex('#dcc4a0'), BONE = P('#9c8c70', '#c8b898', '#e8dcc0');
  for (let f = 0; f < 6; f++) {
    const [ox, oy] = at('gib', f);
    const s = 100 + f * 7;
    const rx = 3.6 + hash2(f, 1, 3) * 2.4, ry = 2.8 + hash2(f, 2, 3) * 2;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = (x + 0.5 - 8) / rx, dy = (y + 0.5 - 8) / ry;
      const ang = Math.atan2(dy, dx);
      const edge = 1 + (hash2(Math.floor((ang + 4) * 2.2), f, s) - 0.5) * 0.5 + Math.sin(ang * 3 + f) * 0.12;
      const d = Math.sqrt(dx * dx + dy * dy) / edge;
      if (d > 1) continue;
      const light = clamp01(0.62 - (dx + dy) * 0.28 - d * 0.25 + (fbm(x / 2.5, y / 2.5, 2, s) - 0.5) * 0.5);
      let c = pal(MEAT, light, x, y, s);
      if (fbm(x / 3, y / 1.6, 2, s + 9) > 0.66 && d < 0.85) c = mix(FAT, c, 0.25 + (1 - light) * 0.3);
      p.set(ox + x, oy + y, c);
    }
    if (f % 3 === 0) { // bone end sticking out
      const bx = ox + 8 + Math.round(rx * 0.6), by = oy + 7;
      p.rect(bx, by, 3, 2, BONE[1]); p.rect(bx, by, 3, 1, BONE[2]); p.set(bx + 3, by, BONE[1]); p.set(bx + 3, by + 1, BONE[0]); p.set(bx - 1, by + 1, MEAT[0]);
    } else if (f % 3 === 1) { // skin flap
      for (let x = -3; x <= 3; x++) p.set(ox + 8 + x, oy + 8 - Math.round(ry) + (Math.abs(x) > 2 ? 1 : 0), hex('#b08068'));
    }
    p.set(ox + 6, oy + 6, MEAT[5]);
  }
  // wet outline around gibs
  for (let f = 0; f < 6; f++) {
    const [ox, oy] = at('gib', f);
    const sub = new Px(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = p.get(ox + x, oy + y); if (c[3]) sub.set(x, y, [c[0], c[1], c[2]], c[3]); }
    sub.outline('#1a0405');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = sub.get(x, y); if (c[3] && !p.get(ox + x, oy + y)[3]) p.set(ox + x, oy + y, [c[0], c[1], c[2]], 255); }
  }

  // pixel spark: hot head on the right, cooling tail to the left
  {
    const [ox, oy] = at('sparkPx');
    const T = P('#ff6a1a', '#ffb040', '#ffe890', '#ffffff');
    for (let x = 0; x < 8; x++) { const t = x / 7; p.set(ox + x, oy + 4, pal(T, t, x, 0), (0.25 + t * 0.75) * 255); }
    p.set(ox + 7, oy + 3, '#fff4c0', 160); p.set(ox + 7, oy + 5, '#fff4c0', 160); p.set(ox + 6, oy + 4, '#ffffff');
  }

  // water splash crown (anchored at the bottom of the cell = the surface): a sheet rises, breaks into a crown of
  // jets that bead into droplets, then collapses back with a foam ring
  {
    const W = P('#2a6a88', '#5aa8c8', '#a8e0f0', '#eaffff');
    for (let f = 0; f < 6; f++) {
      const [ox, oy] = at('splash', f);
      const t = f / 5;
      const rise = Math.sin(Math.min(1, t * 1.5) * Math.PI); // 0 -> 1 -> 0
      const spread = 3 + t * 8;
      for (let k = -4; k <= 4; k++) {
        const lean = k * (0.18 + t * 0.25);
        const hk = (2 + rise * 20) * (1 - Math.abs(k) / 6) * (0.75 + hash2(k, 3, 7) * 0.5);
        const bx = 16 + (k * spread) / 4;
        for (let y = 0; y < hk; y++) {
          const w = Math.max(0, 1.4 - (y / hk) * 1.3) * (1 - t * 0.4);
          // the jet beads into droplets toward its tip as it ages
          if (y > hk * (0.75 - t * 0.35) && ((y + k) % 3) !== 0) continue;
          for (let dx = -Math.round(w); dx <= Math.round(w); dx++) p.set(ox + Math.round(bx + dx + lean * y), oy + 30 - y, pal(W, 0.35 + (y / hk) * 0.6 - Math.abs(dx) * 0.2, bx + dx, y, 3));
        }
        // flung droplets on ballistic arcs (falling in the late frames)
        if (t > 0.2) {
          const dt_ = t - 0.2, vx = k * 1.6, vy = 20 * (0.6 + hash2(k, 5, 7) * 0.5);
          const dxp = vx * dt_ * 2.2, dyp = vy * dt_ * 1.6 - 30 * dt_ * dt_ * 2.2;
          const px_ = 16 + dxp, py_ = 30 - dyp;
          if (py_ > 1 && py_ < 31 && px_ > 0 && px_ < 31) { p.set(ox + Math.round(px_), oy + Math.round(py_), W[3]); if (hash2(k, f, 9) > 0.5) p.set(ox + Math.round(px_), oy + Math.round(py_) + 1, W[2]); }
        }
      }
      // foam ring at the base
      for (let x = Math.round(16 - spread - 2); x <= 16 + spread + 2; x++) { p.set(ox + x, oy + 31, W[2]); if (hash2(x, f, 9) > 0.45) p.set(ox + x, oy + 30, W[3]); }
    }
  }

  // magic twinkle (painted near-white, tinted per particle): dot, plus, 4-point star with sparkle, plus
  {
    for (let f = 0; f < 4; f++) {
      const [ox, oy] = at('magic', f);
      const arm = [1, 3, 6, 3][f];
      for (let i = -arm; i <= arm; i++) {
        const a = (1 - Math.abs(i) / (arm + 1)) * 255;
        p.set(ox + 8 + i, oy + 8, '#ffffff', a); p.set(ox + 8, oy + 8 + i, '#ffffff', a);
      }
      if (f === 2) for (const [dx, dy] of [[-2, -2], [2, 2], [2, -2], [-2, 2]]) p.set(ox + 8 + dx, oy + 8 + dy, '#d8d8ff', 150);
      p.rect(ox + 7, oy + 7, 2, 2, '#ffffff');
      p.ellipse(ox + 8, oy + 8, 3.5, 3.5, () => [190, 200, 255], 50);
      p.rect(ox + 7, oy + 7, 2, 2, '#ffffff');
    }
  }

  // shockwave ring: crisp 2 px ring that thins and fades, with a dithered inner haze
  for (let f = 0; f < 6; f++) {
    const [ox, oy] = at('shock', f);
    const t = f / 5, r = 7 + t * 23, th = 2.6 - t * 1.6;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32);
      if (Math.abs(d - r) < th) p.set(ox + x, oy + y, d < r ? '#ffffff' : '#c8f0ff', (1 - t * 0.6) * 255);
      else if (d < r && d > r * 0.55 && ((x + y + f) & 3) === 0) p.set(ox + x, oy + y, '#a0d8ff', (0.5 - t * 0.4) * 255);
    }
  }

  // muzzle flash pointing +x: hot core, flame petals, cross spikes
  {
    const F = P('#c03a10', '#ff7a20', '#ffc050', '#fff0b0', '#ffffff');
    for (let f = 0; f < 3; f++) {
      const [ox, oy] = at('muzzle', f);
      const L = [13, 15, 9][f], Wd = [4.5, 3.5, 2.5][f];
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const dx = x + 0.5 - 12, dy = y + 0.5 - 16;
        // main forward cone + side petals
        const fwd = dx > 0 ? (dx / L) ** 2 + (dy / (Wd * (1 - dx / (L * 1.4)))) ** 2 : (dx / 4) ** 2 + (dy / Wd) ** 2;
        const pet = Math.min(((dx - 3) / 6) ** 2 + ((Math.abs(dy) - 4) / 1.6) ** 2, 9);
        const v = Math.min(fwd, pet * 1.2);
        if (v > 1) continue;
        p.set(ox + x, oy + y, pal(F, 1 - v + (f === 2 ? -0.3 : 0), x, y, f));
      }
      p.rect(ox + 11, oy + 15, 3, 2, '#ffffff');
    }
  }

  // explosion (64 px, 8 frames): flash -> fireball -> rolling fire turning to sooty smoke -> dispersing smoke
  {
    const FIRE = P('#120a08', '#2a1a14', '#4a2a1c', '#7a2a12', '#b2400e', '#e8701a', '#ffb43a', '#ffe68a', '#ffffff');
    for (let f = 0; f < 8; f++) {
      const [ox, oy] = at('explosion', f);
      const t = f / 7;
      const R = 9 + 21 * Math.pow(t, 0.55);
      const puffs: [number, number, number][] = [];
      for (let i = 0; i < 9; i++) {
        const a = hash2(i, 4, 77) * Math.PI * 2, d = R * (0.25 + hash2(i, 5, 77) * 0.45);
        puffs.push([32 + Math.cos(a) * d, 32 + Math.sin(a) * d * 0.9 - t * 6, R * (0.35 + hash2(i, 6, 77) * 0.3)]);
      }
      puffs.push([32, 32 - t * 4, R * 0.6]);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        let dens = 0, lx = 0, ly = 0;
        for (const [px, py, pr] of puffs) {
          const dx = (x + 0.5 - px) / pr, dy = (y + 0.5 - py) / pr;
          const v = 1 - Math.sqrt(dx * dx + dy * dy);
          if (v > dens) { dens = v; lx = dx; ly = dy; }
        }
        if (dens < -0.2) continue;
        const n = fbm((x - 32) / R * 2.2 + 9, (y - 32) / R * 2.2, 3, 41);
        const rim = 1 - smooth01((Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / 32 - 0.8) / 0.2);
        dens = (dens * 1.4 - (n - 0.5) * (0.8 + t) * Math.min(1, dens + 0.6) - Math.max(0, t - 0.55) * 0.9) * rim;
        if (dens <= 0.02) continue;
        const rr = Math.hypot(x + 0.5 - 32, y + 0.5 - 32) / R;
        // temperature: hot core early, cooling outward and over time; smoke wins late
        let T = (1 - rr * 0.85) * (1.25 - t * 1.25) + (n - 0.5) * 0.5 + dens * 0.4;
        if (f === 0) T = 1.2 - rr * 0.5;
        const light = (-lx - ly) * 0.12;
        const v = T > 0.25 ? 0.35 + T * 0.6 : clamp01(0.08 + dens * 0.35 + light + (n - 0.5) * 0.2) * 0.42;
        const col = pal(FIRE, v, x + ox, y + oy, 41);
        let a = clamp01(dens * 2.4) * (1 - Math.max(0, t - 0.6) * 1.6);
        a = Math.ceil(a * 4) / 4;
        if (a > 0) p.set(ox + x, oy + y, col, a * 255);
      }
      if (f === 0) for (let i = 0; i < 8; i++) { // flash spikes
        const a = (i / 8) * Math.PI * 2 + 0.3;
        for (let k = 8; k < 26; k++) p.set(ox + 32 + Math.cos(a) * k, oy + 32 + Math.sin(a) * k, '#fff4c8', (1 - k / 26) * 255);
      }
    }
  }

  // rock / shell chips
  {
    const C = P('#3a3630', '#5a544a', '#7e766a', '#a49a8a');
    for (let f = 0; f < 4; f++) {
      const [ox, oy] = at('chip', f);
      const pts: [number, number][] = [];
      const n = 5;
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + hash2(i, f, 1) * 0.8, r = 1.8 + hash2(i, f, 2) * 1.8; pts.push([ox + 4 + Math.cos(a) * r, oy + 4 + Math.sin(a) * r]); }
      p.poly(pts, (x, y) => pal(C, 0.75 - ((x - ox - 4) + (y - oy - 4)) * 0.12, x, y, f));
    }
  }

  // small flame (loop)
  {
    const F = P('#7a1a08', '#c8400c', '#f08020', '#ffc048', '#fff2b0');
    for (let f = 0; f < 4; f++) {
      const [ox, oy] = at('fire', f);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const yy = (15.5 - y) / 13, sway = Math.sin(yy * 4 + f * 1.6) * yy * 1.6;
        const w = 4.2 * Math.pow(Math.max(0, 1 - yy), 0.7) * (1 + 0.15 * Math.sin(f * 2.1 + yy * 7));
        const dx = Math.abs(x + 0.5 - 8 - sway);
        if (yy < 0 || yy > 1 || dx > w) continue;
        const T = (1 - dx / Math.max(0.5, w)) * 0.8 + (1 - yy) * 0.45 - 0.15 + (hash2(x, y, f) - 0.5) * 0.15;
        p.set(ox + x, oy + y, pal(F, T, x, y, f));
      }
    }
  }
}

/** the shared particle sprite atlas texture (512 px, nearest), e.g. for previews or UI reuse */
export function particleAtlas(): THREE.Texture { return (ATLAS ??= buildAtlas()).tex; }

// ------------------------------------------------------------------------------------------------ particles
interface Part {
  k: PKind; d: SpriteDef; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; delay: number;
  size: number; size1: number; rot: number; vr: number; col: THREE.Color; alpha: number; add: boolean; grav: number; drag: number;
  wob: number; seed: number; frame: number; drift: number; under: boolean; emit: boolean;
}

export interface EmitOpts {
  n?: number; spread?: number; vx?: number; vy?: number; speed?: number; life?: number; size?: number; size1?: number;
  color?: string | THREE.Color; alpha?: number; add?: boolean; z?: number; grav?: number; drag?: number;
  /** seconds before the particle appears */
  delay?: number;
  /** HDR brightness multiplier on the colour (glows, fire) */
  bright?: number;
  /** 0..1: how much the underwater current carries it */
  drift?: number;
  /** fixed rotation (radians); default per kind */
  rot?: number;
  /** spin speed (rad/s) */
  vr?: number;
}

const MAX = 6000;
const MAX_GIBS = 160;
const MAX_DEBRIS = 600;

interface Chunk { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; vrx: number; vry: number; s: number; sx: number; sy: number; sz: number; life: number; col: THREE.Color; bleed: number; acc: number }

export class Particles {
  points: THREE.Points;
  pointsAdd: THREE.Points;
  private geoAdd: THREE.BufferGeometry;
  private ps: Part[] = [];
  private geo: THREE.BufferGeometry;
  private aPos: Float32Array; private aCol: Float32Array; private aMisc: Float32Array; private aRect: Float32Array;
  private atlas: Atlas;
  private debrisMesh: THREE.InstancedMesh;
  private debris: Chunk[] = [];
  private gibMesh: THREE.InstancedMesh | null = null;
  private gibList: Chunk[] = [];
  private group: THREE.Group | null = null;
  private rig: Lighting | null = null;
  private rigChecked = 0;
  waterAt: (x: number) => number = () => 0;
  onSurfacePop?: (x: number, s: number) => void;
  floorAt: (x: number) => number = () => -1e9;
  /** underwater current (m/s) that drifting particles (blood, silt, smoke) are carried by */
  current = new THREE.Vector2(0.12, 0.02);
  /** set to route light flashes somewhere specific (default: the Lighting rig found in the same scene) */
  onFlash?: (x: number, y: number, color: string, intensity: number, dur: number) => void;

  constructor() {
    this.atlas = ATLAS ??= buildAtlas();
    this.geo = new THREE.BufferGeometry();
    this.aPos = new Float32Array(MAX * 3); this.aCol = new Float32Array(MAX * 4); this.aMisc = new Float32Array(MAX * 4); this.aRect = new Float32Array(MAX * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.aCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aMisc', new THREE.BufferAttribute(this.aMisc, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRect', new THREE.BufferAttribute(this.aRect, 4).setUsage(THREE.DynamicDrawUsage));
    const VS = /* glsl */ `
        attribute vec4 aCol; attribute vec4 aMisc; attribute vec4 aRect; // misc: size, rot, flags, seed
        uniform float uScale; uniform vec2 uViewRes; uniform float uWaterY; uniform vec3 uDepthExt; uniform vec3 uDepthMin;
        varying vec4 vCol; varying vec4 vRect; varying float vRot; varying float vFlags; varying float vSeed; varying vec3 vLight;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          float sc = uViewRes.y > 0.0 ? projectionMatrix[1][1] * 0.5 * uViewRes.y : uScale;
          gl_PointSize = max(1.0, floor(aMisc.x * sc / -mv.z + 0.5));
          vCol = aCol; vRect = aRect; vRot = aMisc.y; vFlags = aMisc.z; vSeed = aMisc.w;
          float depth = max(0.0, uWaterY - wp.y);
          vLight = mod(floor(aMisc.z / 2.0), 2.0) > 0.5 ? vec3(1.0) : mix(vec3(1.0), max(exp(-uDepthExt * depth), uDepthMin), 0.85);
        }`;
    const FS = (additive: boolean) => /* glsl */ `
        uniform sampler2D uAtlas; varying vec4 vCol; varying vec4 vRect; varying float vRot; varying float vFlags; varying float vSeed; varying vec3 vLight;
        float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
        float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
        void main() {
          vec2 pc = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          pc = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y) + 0.5;
          if (pc.x < 0.0 || pc.y < 0.0 || pc.x > 1.0 || pc.y > 1.0) discard;
          vec2 uv = vec2(vRect.x + pc.x * vRect.z, 1.0 - (vRect.y + pc.y * vRect.w));
          vec4 t = texture2D(uAtlas, uv);
          float a = t.a * vCol.a;
          vec3 rgb = t.rgb * vCol.rgb * vLight;
          if (mod(vFlags, 2.0) > 0.5) { float l = dot(t.rgb, vec3(0.3, 0.55, 0.15)); rgb *= 1.0 + 4.0 * l * l * l; }
          ${additive
            ? 'if (a < 0.01) discard; gl_FragColor = vec4(rgb * a * 1.6, 1.0);'
            : 'if (a < 0.03 || a < bayer4(gl_FragCoord.xy + floor(vSeed * 4.0)) * 0.96 + 0.02) discard; gl_FragColor = vec4(rgb, 1.0);'}
        }`;
    const uniforms = {
      uAtlas: { value: this.atlas.tex }, uScale: { value: 600 }, uViewRes: RETRO.uRes,
      uWaterY: UW.uWaterY, uDepthExt: UW.uDepthExt, uDepthMin: UW.uDepthMin,
    };
    // hard-edged pixel sprites write depth (so the water fog treats them like the solid things they are) and
    // use stipple alpha; glows are additive and depth-free
    const matHard = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS(false) });
    const matAdd = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS(true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.geoAdd = new THREE.BufferGeometry();
    for (const k of ['position', 'aCol', 'aMisc', 'aRect']) this.geoAdd.setAttribute(k, this.geo.getAttribute(k));
    this.points = new THREE.Points(this.geo, matHard);
    this.pointsAdd = new THREE.Points(this.geoAdd, matAdd);
    this.pointsAdd.frustumCulled = false;
    this.pointsAdd.renderOrder = 21;
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'particles';

    // low-poly chunks: faceted rock / coral / wood bits with a neutral grit texture tinted per instance
    const grit = tex('grit', { size: 32 });
    const chunkGeo = new THREE.IcosahedronGeometry(0.62, 0);
    const dm = uw(new THREE.MeshStandardMaterial({ map: grit.map, normalMap: grit.normal, roughness: 0.9, metalness: 0, flatShading: true }), { caustics: 0.6 });
    this.debrisMesh = new THREE.InstancedMesh(chunkGeo, dm, MAX_DEBRIS);
    this.debrisMesh.count = 0;
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_DEBRIS * 3), 3);
  }

  get object() {
    const g = new THREE.Group();
    g.add(this.points, this.pointsAdd, this.debrisMesh);
    if (this.gibMesh) g.add(this.gibMesh);
    this.group = g;
    return g;
  }
  get count() { return this.ps.length; }

  private ensureGibs() {
    if (this.gibMesh) return this.gibMesh;
    const fl = tex('flesh', { size: 32, seed: 3 });
    const g = new THREE.IcosahedronGeometry(1, 0);
    // a few dents so each gib isn't a perfect d20
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const k = 0.75 + hash2(Math.round(pa.getX(i) * 9), Math.round(pa.getY(i) * 9) + Math.round(pa.getZ(i) * 9) * 7, 5) * 0.45; pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k, pa.getZ(i) * k); }
    g.computeVertexNormals();
    const m = uw(new THREE.MeshStandardMaterial({ map: fl.map, normalMap: fl.normal, roughnessMap: fl.rough, roughness: 1, metalness: 0, flatShading: true }), { sss: [0.9, 0.15, 0.1], sssK: 0.5, rim: 0.25, rimCol: [1, 0.7, 0.6] });
    this.gibMesh = new THREE.InstancedMesh(g, m, MAX_GIBS);
    this.gibMesh.count = 0;
    this.gibMesh.castShadow = true;
    this.gibMesh.frustumCulled = false;
    this.gibMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_GIBS * 3), 3);
    this.group?.add(this.gibMesh);
    if (!this.group) this.points.parent?.add(this.gibMesh);
    return this.gibMesh;
  }

  private findRig(): Lighting | null {
    const now = performance.now();
    if (!this.rig && now - this.rigChecked > 1000) { this.rigChecked = now; this.rig = rigOf(this.points); }
    return this.rig;
  }
  /** a short point-light flash (muzzle, explosion, spell) */
  light(x: number, y: number, color: string, intensity = 6, dur = 0.12) {
    if (this.onFlash) { this.onFlash(x, y, color, intensity, dur); return; }
    this.rigChecked = 0;
    this.findRig()?.flash(x, y, color, intensity, dur, 6 + intensity * 0.3);
  }

  emit(kind: PKind, x: number, y: number, o: EmitOpts = {}) {
    const n = o.n ?? 1;
    const d = DEFS[kind] ?? DEFS.glow;
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= MAX) this.ps.shift();
      const sp = o.spread ?? 0.1;
      const ang = Math.random() * Math.PI * 2, spd = (o.speed ?? 0) * (0.4 + Math.random() * 0.6);
      const life = (o.life ?? d.life) * (0.7 + Math.random() * 0.6);
      const size = (o.size ?? d.size) * (0.7 + Math.random() * 0.6);
      const col = new THREE.Color(o.color ?? '#ffffff');
      if (o.bright) col.multiplyScalar(o.bright);
      const rot = o.rot ?? (d.rot === 'random' ? Math.random() * Math.PI * 2 : d.rot === 'quarter' ? Math.floor(Math.random() * 4) * Math.PI * 0.5 : 0);
      const px = x + (Math.random() - 0.5) * sp * 2, py = y + (Math.random() - 0.5) * sp * 2;
      this.ps.push({
        k: kind, d, x: px, y: py, z: (o.z ?? 0) + (Math.random() - 0.5) * sp,
        vx: (o.vx ?? 0) + Math.cos(ang) * spd, vy: (o.vy ?? d.vy ?? 0) + Math.sin(ang) * spd, vz: (Math.random() - 0.5) * spd * 0.5,
        life, max: life, delay: o.delay ?? 0, size, size1: o.size1 !== undefined ? o.size1 * (size / (o.size ?? d.size)) : size,
        rot, vr: o.vr ?? (d.rot === 'random' ? (Math.random() - 0.5) * 4 : 0),
        col, alpha: o.alpha ?? 1, add: o.add ?? d.add, grav: o.grav ?? d.grav ?? 0, drag: o.drag ?? 1.6,
        wob: kind.startsWith('bubble') ? 1 : 0, seed: Math.random(), frame: d.anim === 'variant' ? Math.floor(Math.random() * d.frames) : 0,
        drift: o.drift ?? 0, under: py < this.waterAt(px), emit: !!d.emit,
      });
    }
  }
  burst(kind: PKind, x: number, y: number, n: number, speed: number, o: EmitOpts = {}) { this.emit(kind, x, y, { ...o, n, speed, vy: o.vy ?? 0 }); }

  /** low-poly chunks (rock, coral, wood, shell) */
  debrisBurst(x: number, y: number, n: number, color: string | THREE.Color, speed = 3, size = 0.09, z = 0) {
    const c = new THREE.Color(color).multiplyScalar(1.15);
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      const cc = c.clone().multiplyScalar(0.75 + Math.random() * 0.45);
      this.debris.push(this.chunk(x, y, z, Math.cos(a) * s, Math.sin(a) * s + 1, size * (0.5 + Math.random()), 2.5 + Math.random() * 2, cc, 0));
    }
  }
  private chunk(x: number, y: number, z: number, vx: number, vy: number, s: number, life: number, col: THREE.Color, bleed: number): Chunk {
    return {
      x, y, z: z + (Math.random() - 0.5) * 0.3, vx, vy, vz: (Math.random() - 0.5) * Math.hypot(vx, vy) * 0.4,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, vrx: (Math.random() - 0.5) * 14, vry: (Math.random() - 0.5) * 14,
      s, sx: 0.75 + Math.random() * 0.5, sy: 0.6 + Math.random() * 0.5, sz: 0.75 + Math.random() * 0.5, life, col, bleed, acc: 0,
    };
  }

  /** textured low-poly flesh gibs; underwater they sink slowly trailing blood */
  gibs(x: number, y: number, n: number, speed = 4, dir = 0, spreadAng = Math.PI, z = 0) {
    this.ensureGibs();
    for (let i = 0; i < n; i++) {
      if (this.gibList.length >= MAX_GIBS) this.gibList.shift();
      const a = dir + (Math.random() - 0.5) * spreadAng * 2, s = speed * (0.35 + Math.random() * 0.65);
      const k = Math.random();
      // meat, darker organ, pale fat / bone
      const col = new THREE.Color(k < 0.65 ? '#ffffff' : k < 0.85 ? '#a86870' : '#f0d8c0').multiplyScalar(0.85 + Math.random() * 0.3);
      this.gibList.push(this.chunk(x, y, z, Math.cos(a) * s, Math.sin(a) * s + 1.2, 0.05 + Math.random() * 0.09, 5 + Math.random() * 4, col, 1));
    }
  }

  /** a surface splash at x: animated crown, droplets fly up, bubbles get dragged down */
  splash(x: number, strength = 1, y = this.waterAt(x)) {
    const s = Math.min(3, strength);
    const sz = 0.7 + s * 0.45;
    this.emit('splash', x, y + sz * 0.5 - 0.06, { n: 1, size: sz, life: 0.5 + s * 0.08, spread: 0 });
    if (s > 1.2) this.emit('splash', x + (Math.random() - 0.5) * 0.4, y + sz * 0.35, { n: 1, size: sz * 0.7, life: 0.45, spread: 0, delay: 0.08 });
    this.emit('droplet', x, y + 0.05, { n: Math.round(6 + s * 10), spread: 0.25 * s, vy: 2.5 + s * 1.6, speed: 1.6 + s, life: 1.0, size: 0.09, grav: -9.8, drag: 0.3 });
    this.emit('bubble', x, y - 0.25, { n: Math.round(4 + s * 8), spread: 0.4 * s, vy: -0.5 - s * 0.6, speed: 0.6 + s * 0.4, life: 2.2, size: 0.12 });
    this.emit('ring', x, y, { n: 1, size: 0.3 + s * 0.4, size1: 1.2 + s * 1.2, life: 0.5, alpha: 0.6, add: true, vy: 0, grav: 0 });
  }

  /**
   * Gore: blood + flesh. amount ~0.3 (nick) .. 1 (kill) .. 3 (explosive kill). dir = spray direction (radians or
   * a vector); omitted = all around. Underwater: clouds that bloom and drift, dark mist, sinking gibs that bleed.
   * In air: droplets on ballistic arcs (they turn into clouds when they hit the water), gibs.
   */
  gore(x: number, y: number, amount = 1, dir?: number | { x: number; y: number }, z = 0) {
    const a = Math.max(0.15, Math.min(4, amount));
    const has = dir !== undefined;
    const ang = typeof dir === 'number' ? dir : dir ? Math.atan2(dir.y, dir.x) : 0;
    const cx = Math.cos(ang), cy = Math.sin(ang);
    const under = y < this.waterAt(x);
    const rnd = (k: number) => (Math.random() - 0.5) * 2 * k;
    if (under) {
      const nc = Math.round(2 + 4 * a);
      for (let i = 0; i < nc; i++) {
        const sp = has ? 0.4 + Math.random() * 1.4 * a : 0.6 * a;
        const aa = has ? ang + rnd(0.7) : Math.random() * Math.PI * 2;
        this.emit('blood', x + rnd(0.15 * a), y + rnd(0.15 * a), {
          vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp - 0.05, size: 0.55 + Math.random() * 0.45 * Math.min(2, a), size1: 1.0 + 0.5 * Math.min(2, a),
          life: 3 + Math.random() * 2.5, drag: 2.2, grav: -0.25, drift: 1, z, delay: i < 2 ? 0 : Math.random() * 0.15,
        });
      }
      // fine dark mist flung along the wound direction
      this.emit('bloodDrop', x, y, { n: Math.round(6 + 10 * a), speed: 3.5 * Math.min(2, a), vx: has ? cx * 2.5 : 0, vy: has ? cy * 2.5 : 0, spread: 0.1, drag: 4.5, life: 0.9, size: 0.13, grav: -0.5, z });
      this.emit('gib', x, y, { n: Math.round(a * 1.6), speed: 2.2, vx: has ? cx * 1.5 : 0, vy: has ? cy * 1.5 : 0.3, drag: 2.5, grav: -0.9, life: 3.5, vr: rnd(3), z });
      if (a >= 0.6) this.gibs(x, y, Math.round(1 + a * 2.2), 2.8 + a, ang, has ? 0.9 : Math.PI, z);
    } else {
      this.emit('bloodDrop', x, y, { n: Math.round(10 + 16 * a), speed: 2.5 + 3 * a, vx: has ? cx * (2 + 2 * a) : 0, vy: (has ? cy * (2 + 2 * a) : 0) + 1.2, spread: 0.12, drag: 0.4, life: 1.6, grav: -9.8, z });
      this.emit('smoke', x, y, { n: Math.max(1, Math.round(a)), color: '#a01818', size: 0.5, size1: 0.9, life: 0.45, spread: 0.15, vx: cx * 0.5, vy: cy * 0.5, z });
      this.emit('gib', x, y, { n: Math.round(a * 2), speed: 4, vy: 3, grav: -9.8, drag: 0.3, life: 2.5, vr: rnd(10), z });
      if (a >= 0.6) this.gibs(x, y, Math.round(1 + a * 2.2), 4 + a * 1.5, has ? ang : Math.PI / 2, has ? 0.8 : 1.2, z);
    }
  }
  /** a wisp of blood from a wound (call every few frames while bleeding; k ~0.2..1) */
  bleed(x: number, y: number, k = 0.4, z = 0) {
    if (y < this.waterAt(x)) this.emit('blood', x, y, { size: 0.25 + k * 0.3, size1: 0.6 + k * 0.5, life: 2 + k * 2, drag: 2.5, grav: -0.2, drift: 1, vx: (Math.random() - 0.5) * 0.3, vy: -0.1, z });
    else this.emit('bloodDrop', x, y, { vy: -0.5, speed: 0.6, grav: -9.8, drag: 0.3, life: 1.2, z });
  }
  /** sand / silt puffs billowing up off the seabed (or dust in air) */
  silt(x: number, y: number, n = 8, spread = 0.6, z = 0) {
    for (let i = 0; i < n; i++) {
      const s = (Math.random() - 0.5) * 2;
      this.emit('silt', x + s * spread, y + Math.random() * 0.15, { vx: s * 0.9, vy: 0.3 + Math.random() * 0.6, size: 0.55 + Math.random() * 0.5, size1: 1.1 + Math.random() * 0.6, life: 1.6 + Math.random() * 1.6, drag: 2.0, grav: -0.35, drift: 0.7, z, delay: Math.random() * 0.1 });
    }
    this.emit('chip', x, y + 0.05, { n: Math.round(n * 0.6), speed: 2.5, vy: 2.2, grav: -9.8, drag: 1.2, color: '#c8b48c', z });
  }
  /** rising smoke puffs (in air); underwater this becomes silt-coloured murk */
  smoke(x: number, y: number, n = 4, z = 0) {
    const under = y < this.waterAt(x);
    for (let i = 0; i < n; i++) this.emit(under ? 'silt' : 'smoke', x, y, { spread: 0.25, vx: (Math.random() - 0.5) * 0.6, vy: under ? 0.3 : 0.9 + Math.random() * 0.5, size: 0.6 + Math.random() * 0.4, size1: 1.4, life: 1.8 + Math.random() * 1.5, drag: 1.2, grav: under ? -0.1 : 0, drift: 0.6, z, delay: Math.random() * 0.2 });
  }
  /** hot pixel sparks (velocity-oriented streaks); dir = main direction (radians) or omitted for radial */
  sparks(x: number, y: number, n = 12, dir?: number, speed = 6, color = '#ffffff', z = 0) {
    for (let i = 0; i < n; i++) {
      const a = dir === undefined ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.3;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit('sparkPx', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: y < this.waterAt(x) ? 5 : 0.6, color, bright: 2.2, z, spread: 0.04 });
    }
  }
  /** mana twinkles + soft core glow (tinted: '#6fb4ff' blue, '#b07aff' purple ...) */
  magic(x: number, y: number, color = '#7ab8ff', n = 14, z = 0) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 2;
      this.emit('magic', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s + 0.4, drag: 3, color: c, bright: 0.9, life: 0.6 + Math.random() * 0.7, size: 0.3 + Math.random() * 0.25, z, spread: 0.1, delay: Math.random() * 0.12 });
    }
    this.emit('glow', x, y, { color: c, bright: 0.7, size: 1.4, size1: 0.3, life: 0.35, spread: 0, z });
    this.sparks(x, y, Math.round(n * 0.4), undefined, 3.5, '#' + c.clone().lerp(new THREE.Color('#ffffff'), 0.5).getHexString(), z);
    this.light(x, y, '#' + c.getHexString(), 3.5, 0.3);
  }
  /** expanding pixel shockwave ring */
  shockwave(x: number, y: number, size = 1, color = '#ffffff', z = 0.05) {
    this.emit('shock', x, y, { size: 2.2 * size, color, bright: 1.2, life: 0.4 + size * 0.06, spread: 0, z });
  }
  /** muzzle flash pointing along angle (radians), with a light flash and a puff */
  muzzle(x: number, y: number, angle: number, size = 1, z = 0.1) {
    const fx = x + Math.cos(angle) * 0.2 * size, fy = y + Math.sin(angle) * 0.2 * size;
    this.emit('muzzle', fx, fy, { size: 0.75 * size, rot: angle, bright: 2.5, spread: 0, z });
    this.sparks(fx, fy, Math.round(3 * size), angle, 7, '#ffe0a0', z);
    this.smoke(fx + Math.cos(angle) * 0.2, fy + Math.sin(angle) * 0.2, 1, z);
    this.light(fx, fy, '#ffd38a', 7 * size, 0.07);
  }
  /** explosion: flash light, fireball (or a brief flash + gas bubble cloud underwater), shockwave, sparks, smoke, debris */
  explosion(x: number, y: number, size = 1, z = 0) {
    const s = Math.max(0.3, size);
    const under = y < this.waterAt(x);
    this.light(x, y, under ? '#bfe8ff' : '#ffc070', 16 * s, 0.35 + 0.1 * s);
    this.shockwave(x, y, s * (under ? 1.3 : 1), under ? '#d8f4ff' : '#fff0d0');
    this.emit('glow', x, y, { color: '#fff2c8', bright: 2.5, size: 2.4 * s, size1: 0.4 * s, life: 0.22, spread: 0, z });
    if (!under) {
      this.emit('explosion', x, y, { size: 2.0 * s, life: 0.95, spread: 0, z, vy: 0.4 });
      for (let i = 0; i < 3; i++) this.emit('explosion', x + (Math.random() - 0.5) * s, y + (Math.random() - 0.3) * s * 0.8, { size: 1.2 * s, life: 0.8, spread: 0, z: z - 0.05, delay: 0.05 + i * 0.06, vy: 0.6 });
      this.smoke(x, y + 0.3 * s, Math.round(4 * s), z - 0.1);
      this.sparks(x, y, Math.round(22 * s), undefined, 9 * s, '#ffe8b0', z);
      this.emit('ember', x, y, { n: Math.round(10 * s), speed: 5 * s, vy: 2, grav: -6, drag: 0.5, color: '#ff9a40', life: 1.4, size: 0.12, z });
      this.debrisBurst(x, y, Math.round(8 * s), '#5a5048', 6 * s, 0.1, z);
    } else {
      // underwater: a short-lived hot core, then the gas bubble breaks into a churning bubble column
      this.emit('explosion', x, y, { size: 1.6 * s, life: 0.45, spread: 0, z });
      this.emit('bubbleBig', x, y, { n: Math.round(16 * s), spread: 0.5 * s, speed: 3 * s, vy: 1.2, life: 2.5, size: 0.3, z, delay: 0.05 });
      this.emit('bubble', x, y, { n: Math.round(40 * s), spread: 0.7 * s, speed: 4 * s, vy: 1, life: 2.5, z });
      this.sparks(x, y, Math.round(10 * s), undefined, 6 * s, '#ffe8b0', z);
      this.debrisBurst(x, y, Math.round(8 * s), '#5a5048', 4 * s, 0.1, z);
      if (y - this.floorAt(x) < 2.5 * s) this.silt(x, this.floorAt(x) + 0.1, Math.round(10 * s), 1.2 * s, z);
      else this.smoke(x, y, Math.round(3 * s), z);
    }
  }

  update(dt: number) {
    this.findRig()?.tick();
    const ps = this.ps;
    const cur = this.current;
    let w = 0;
    const spawn: [number, number, number][] = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.delay > 0) { p.delay -= dt; ps[w++] = p; continue; }
      p.life -= dt;
      if (p.life <= 0) continue;
      const surf = this.waterAt(p.x);
      const under = p.y < surf;
      if (p.wob) {
        // bubbles: buoyancy rises them, they wobble side to side and pop at the surface
        p.vy += (under ? 3.2 : -9.8) * dt;
        p.vx += Math.sin(p.life * 7 + p.seed * 100) * 1.6 * dt;
        p.size *= 1 + dt * 0.05;
        if (under && p.y > surf - 0.06 && p.vy > 0) { p.life = 0; this.onSurfacePop?.(p.x, p.size); continue; }
      } else {
        p.vy += (under ? p.grav * 0.15 : p.grav === 0 ? 0 : -9.8) * dt;
      }
      // blood falling into the water blooms into a cloud
      if (p.k === 'bloodDrop' && under && !p.under) { spawn.push([p.x, surf - 0.05, p.z]); p.life = 0; continue; }
      p.under = under;
      const dr = Math.exp(-(under ? p.drag : 0.2) * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      const dk = under ? p.drift : 0;
      p.x += (p.vx + cur.x * dk) * dt; p.y += (p.vy + cur.y * dk) * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      if (p.y < this.floorAt(p.x) && !p.wob) { p.y = this.floorAt(p.x); p.vy *= -0.2; p.vx *= 0.5; }
      ps[w++] = p;
    }
    ps.length = w;
    for (const [x, y, z] of spawn) this.emit('blood', x, y, { size: 0.3, size1: 0.7, life: 2.5, drag: 2.5, grav: -0.2, drift: 1, vy: -0.4, z });
    const n = Math.min(ps.length, MAX);
    let wi = 0;
    const R = this.atlas.rects;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const p = ps[i];
        if (p.add !== (pass === 1) || p.delay > 0) continue;
        const t = 1 - p.life / p.max;
        const d = p.d;
        this.aPos[wi * 3] = p.x; this.aPos[wi * 3 + 1] = p.y; this.aPos[wi * 3 + 2] = p.z;
        const fadeIn = clamp01((p.max - p.life) / 0.06), fadeOut = d.anim === 'life' ? clamp01(p.life / Math.min(0.15, p.max * 0.3)) : clamp01(p.life / Math.min(0.4, p.max * 0.5));
        this.aCol[wi * 4] = p.col.r; this.aCol[wi * 4 + 1] = p.col.g; this.aCol[wi * 4 + 2] = p.col.b; this.aCol[wi * 4 + 3] = p.alpha * fadeIn * fadeOut;
        let f = p.frame;
        if (d.anim === 'life') f = Math.min(d.frames - 1, Math.floor(t * d.frames));
        else if (d.anim === 'loop') f = Math.floor((p.max - p.life) * (d.fps ?? 10) + p.seed * d.frames) % d.frames;
        const rect = R[p.k][f];
        this.aRect[wi * 4] = rect[0]; this.aRect[wi * 4 + 1] = rect[1]; this.aRect[wi * 4 + 2] = rect[2]; this.aRect[wi * 4 + 3] = rect[3];
        const rot = d.rot === 'orient' ? (p.vx * p.vx + p.vy * p.vy > 0.01 ? Math.atan2(p.vy, p.vx) : p.rot) : p.rot;
        if (d.rot === 'orient' && p.vx * p.vx + p.vy * p.vy > 0.01) p.rot = rot;
        this.aMisc[wi * 4] = p.size + (p.size1 - p.size) * t; this.aMisc[wi * 4 + 1] = rot;
        this.aMisc[wi * 4 + 2] = (p.emit ? 1 : 0) + (d.unlit ? 2 : 0); this.aMisc[wi * 4 + 3] = p.seed;
        wi++;
      }
      if (pass === 0) this.geo.setDrawRange(0, wi);
      else this.geoAdd.setDrawRange(this.geo.drawRange.count, wi - this.geo.drawRange.count);
    }
    for (const k of ['position', 'aCol', 'aMisc', 'aRect']) (this.geo.attributes[k] as THREE.BufferAttribute).needsUpdate = true;

    this.debrisMesh.count = this.stepChunks(this.debris, this.debrisMesh, dt, false);
    if (this.gibMesh) this.gibMesh.count = this.stepChunks(this.gibList, this.gibMesh, dt, true);
  }

  private _m = new THREE.Matrix4(); private _q = new THREE.Quaternion(); private _e = new THREE.Euler(); private _s = new THREE.Vector3(); private _p = new THREE.Vector3();
  private stepChunks(list: Chunk[], mesh: THREE.InstancedMesh, dt: number, flesh: boolean): number {
    let dn = 0, w = 0;
    for (const d of list) {
      d.life -= dt;
      if (d.life <= 0) continue;
      const under = d.y < this.waterAt(d.x);
      d.vy += (under ? (flesh ? -1.4 : -2.2) : -9.8) * dt;
      const dr = Math.exp(-(under ? (flesh ? 2.4 : 1.8) : 0.1) * dt);
      d.vx *= dr; d.vy *= dr; d.vz *= dr;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const fl = this.floorAt(d.x);
      const onFloor = d.y - d.s * 0.5 < fl;
      if (onFloor) { d.y = fl + d.s * 0.5; d.vy = Math.abs(d.vy) * 0.25; d.vx *= 0.6; d.vrx *= 0.5; d.vry *= 0.5; }
      d.rx += d.vrx * dt; d.ry += d.vry * dt;
      // gibs bleed while they move (clouds underwater, drips in air)
      if (flesh && d.bleed > 0) {
        d.acc += dt * Math.min(1, Math.hypot(d.vx, d.vy) * 0.6 + 0.15);
        if (d.acc > (under ? 0.12 : 0.18)) {
          d.acc = 0;
          if (under) this.emit('blood', d.x, d.y, { size: 0.18 + d.s * 2, size1: 0.45 + d.s * 3, life: 1.6 + Math.random(), drag: 2.5, grav: -0.2, drift: 1, z: d.z });
          else this.emit('bloodDrop', d.x, d.y, { vy: -0.5, grav: -9.8, drag: 0.3, life: 1.2, z: d.z });
          d.bleed *= 0.93;
        }
      }
      const s = d.s * clamp01(d.life / 0.6);
      this._m.compose(this._p.set(d.x, d.y, d.z), this._q.setFromEuler(this._e.set(d.rx, d.ry, d.rz)), this._s.set(s * d.sx, s * d.sy, s * d.sz));
      mesh.setMatrixAt(dn, this._m);
      mesh.setColorAt(dn, d.col);
      dn++;
      list[w++] = d;
    }
    list.length = w;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return dn;
  }

  /** kept for compatibility: point sprites are now sized from the post pipeline's internal resolution */
  setPixelScale(h: number, fovDeg: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
  clear() { this.ps.length = 0; this.debris.length = 0; this.gibList.length = 0; }
}
