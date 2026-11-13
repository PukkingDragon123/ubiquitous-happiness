// Seabed meadows, ported from MOLEFORGE's forest grass (src/bookends/forest/grass.js) to the underwater look:
// an instanced field of crossed pixel-art quads drawn from one 26-cell atlas of 32 px cells painted pixel by
// pixel. Each clump has its own size, cell, tint and rotation. In the shader it sways with the current
// (slow surge + gusts, squared by height), parts around pushers (the blobfish, fish, divers, explosions) and
// springs back, rides the deformable sand, takes the surface caustics as its dapple, glows when backlit by
// the light from above, varies in patchy hue and darkens with depth like everything else.
//
//   const m = makeMeadow(items, look);  items: [{ x, y, z, rot, size, cell, tint }]   (MC: the cell names)
//   MEADOW.uPushers.value[i].set(x, y, r, k)  — up to 8 pushers, refreshed every frame by the area
import * as THREE from 'three';
import { Px } from '../gfx/px';
import { Rng } from '../core/rng';
import { UW } from '../gfx/shaders/underwater';
import { RETRO } from '../gfx/retro';
import { ENV } from './mats';

const CELL = 32;
export const MC = {
  eelShort: 0, eelMid: 1, eelTall: 2, turtle: 3, spike: 4, redAlgae: 5, brownAlgae: 6, greenAlgae: 7, caulerpa: 8, halimeda: 9,
  anemone: 10, duster: 11, seapen: 12, sponge: 13, shells: 14, pebbles: 15, coralNub: 16, whips: 17, starLitter: 18, deadGrass: 19,
  lettuce: 20, worms: 21, hydroid: 22, lace: 23, kelpling: 24, glow: 25,
};
const NCELL = 26;

export const MEADOW = {
  uPushers: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uKey: { value: new THREE.Color(1, 0.95, 0.85) },
  uAmbTop: { value: new THREE.Color(0.35, 0.6, 0.7) },
  uAmbBot: { value: new THREE.Color(0.08, 0.12, 0.12) },
  uBright: { value: 1 },
};

function atlas(): THREE.Texture {
  const p = new Px(CELL * NCELL, CELL);
  const rng = new Rng(411);
  const set = (x: number, y: number, c: number) => p.set(x, y, '#' + c.toString(16).padStart(6, '0'));
  const blade = (ox: number, x0: number, hgt: number, lean: number, ramp: number[], w = 1) => {
    for (let y = 0; y < hgt; y++) {
      const t = y / Math.max(1, hgt - 1);
      const x = Math.round(x0 + lean * t * t * hgt);
      const ci = Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 0.01)));
      set(ox + x, CELL - 1 - y, ramp[ci]);
      if (w > 1 && t < 0.75) set(ox + x + 1, CELL - 1 - y, ramp[Math.max(0, ci - 1)]);
    }
    return Math.round(x0 + lean * hgt);
  };
  const field = (c: number, n: number, hMin: number, hMax: number, ramp: number[], w = 1, spread = 0.35) => {
    for (let i = 0; i < n; i++) blade(c * CELL, rng.range(2, CELL - 3), Math.round(rng.range(hMin, hMax)), rng.range(-spread, spread), ramp, rng.chance(0.4) ? 2 : w);
  };
  const disc = (cx: number, cy: number, r: number, c0: number, c1: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r) set(x, y, (x - cx) + (y - cy) < -r * 0.4 ? c1 : c0); }
  };
  // hue-shifted ramps: cool dark bases, warm bright tips
  const EEL = [0x163a2e, 0x1e5434, 0x2c6e38, 0x46883c, 0x6aa046, 0x9cba5a];
  const TURTLE = [0x1c4430, 0x28603a, 0x3c7c40, 0x5a9846, 0x86b252];
  const RED = [0x3a0e26, 0x6a1430, 0x9a2238, 0xc8423e, 0xf07a5a];
  const BROWN = [0x2a2010, 0x4a3814, 0x76581c, 0xa27a2a, 0xcca448];
  const GREEN = [0x123a2a, 0x1e5a30, 0x2e8034, 0x52a83a, 0x8ad050];
  const DEAD = [0x3a3022, 0x5a4a2e, 0x7a6a40, 0x9a8a58, 0xbcae7a];
  field(MC.eelShort, 20, 5, 12, EEL, 2);
  field(MC.eelMid, 18, 10, 20, EEL, 2);
  field(MC.eelTall, 12, 16, 30, EEL, 2, 0.45);
  { // turtle grass: broad straps with rounded tips and pale epiphyte spots
    const ox = MC.turtle * CELL;
    for (let i = 0; i < 9; i++) {
      const x0 = Math.round(rng.range(3, CELL - 5)), h = Math.round(rng.range(9, 20)), lean = rng.range(-0.25, 0.25);
      const tx = blade(ox, x0, h, lean, TURTLE, 2); blade(ox, x0 + 1, h - 1, lean, TURTLE);
      set(ox + tx, CELL - 1 - h, TURTLE[4]);
      if (i % 3 === 0) { set(ox + tx, CELL - h + 3, 0xd8d0b0); set(ox + tx + 1, CELL - h + 5, 0xc8c0a0); }
    }
  }
  { // sea grass with seed spikes
    const c = MC.spike, ox = c * CELL;
    field(c, 12, 6, 14, EEL);
    for (let i = 0; i < 4; i++) { const x = Math.round(rng.range(4, CELL - 5)), h = Math.round(rng.range(16, 26)); const tx = blade(ox, x, h, rng.range(-0.15, 0.15), [0x2e5a30, 0x4a7a38, 0x7a9a48]); for (let k = 0; k < 5; k++) set(ox + tx + (k % 2), CELL - h + k, k < 2 ? 0xe8d890 : 0xc0a860); }
  }
  { // red feather algae: pinnate crimson tufts
    const ox = MC.redAlgae * CELL;
    for (let f = 0; f < 6; f++) {
      const a = -0.9 + (f / 5) * 1.8, len = rng.range(10, 18);
      for (let s = 0; s < len; s++) {
        const t = s / len, x = 16 + Math.sin(a) * s, y = CELL - 1 - Math.cos(a) * s * 1.05;
        set(ox + Math.round(x), Math.round(y), RED[Math.min(4, Math.floor(t * 4) + 1)]);
        if (s % 2 === 0 && s > 2) { set(ox + Math.round(x - Math.cos(a) * 2), Math.round(y - 1), RED[Math.min(4, Math.floor(t * 4) + 1)]); set(ox + Math.round(x + Math.cos(a) * 2), Math.round(y - 1), RED[Math.min(4, Math.floor(t * 3) + 2)]); }
      }
    }
  }
  { // brown algae with berry floats (sargassum)
    const c = MC.brownAlgae, ox = c * CELL;
    for (let i = 0; i < 5; i++) {
      const x = Math.round(rng.range(5, CELL - 6)), h = Math.round(rng.range(12, 24));
      const tx = blade(ox, x, h, rng.range(-0.3, 0.3), BROWN);
      for (let y = 4; y < h; y += 3) { const lx = x + Math.round((tx - x) * (y / h)); set(ox + lx + (y % 2 ? 1 : -1), CELL - 1 - y, BROWN[3]); set(ox + lx + (y % 2 ? 2 : -2), CELL - y, BROWN[2]); if (y % 6 === 1) { set(ox + lx + (y % 2 ? -1 : 1), CELL - 1 - y, 0xdcbc58); } }
    }
  }
  field(MC.greenAlgae, 26, 3, 9, GREEN, 1, 0.6);
  { // caulerpa: a runner with upright fronds of tiny green grapes
    const ox = MC.caulerpa * CELL;
    for (let x = 1; x < CELL - 1; x++) set(ox + x, CELL - 2, GREEN[1]);
    for (let i = 0; i < 6; i++) { const x = 3 + i * 5, h = Math.round(rng.range(6, 13)); for (let y = 2; y < h; y++) { set(ox + x, CELL - 1 - y, GREEN[1]); if (y % 2 === 0) { set(ox + x - 1, CELL - 1 - y, GREEN[3]); set(ox + x + 1, CELL - 1 - y, GREEN[4]); } } set(ox + x, CELL - 1 - h, GREEN[4]); }
  }
  { // halimeda: chains of calcified green coins
    const ox = MC.halimeda * CELL;
    for (let i = 0; i < 4; i++) { let x = 6 + i * 6, y = CELL - 2; for (let k = 0; k < 6; k++) { disc(ox + x, y, 1.6, 0x4a8a3a, 0xa8d070); set(ox + x, y + 1, 0x2a5a2a); x += rng.int(-2, 2); y -= 3; } }
  }
  { // little anemones: a short column, a splayed crown of striped tentacles with bright tips
    const ox = MC.anemone * CELL;
    for (const [cx, col, tip] of [[9, 0xc8406a, 0xffb0c8], [22, 0x5aa04a, 0xd8f0a0]] as [number, number, number][]) {
      for (let y = 0; y < 5; y++) for (let x = -2; x <= 2; x++) set(ox + cx + x, CELL - 1 - y, x < 0 ? col : 0x8a2a4a);
      for (let k = 0; k < 9; k++) { const a = Math.PI * (1.1 + 0.8 * k / 8); for (let s = 1; s < 7; s++) { const x = cx + Math.cos(a) * s, y = CELL - 6 + Math.sin(a) * s * 0.9 + s * s * 0.06; set(ox + Math.round(x), Math.round(y), s === 6 ? tip : s % 2 ? col : 0xffffff & (col + 0x202020)); } }
    }
  }
  { // feather duster worms: parchment tubes with banded radial crowns
    const ox = MC.duster * CELL;
    for (const cx of [8, 16, 25]) {
      const h = rng.int(6, 12);
      for (let y = 0; y < h; y++) { set(ox + cx, CELL - 1 - y, 0xb8a888); set(ox + cx + 1, CELL - 1 - y, 0x8a7a60); }
      for (let k = 0; k < 9; k++) { const a = Math.PI * (1.05 + 0.9 * k / 8); for (let s = 1; s < 6; s++) set(ox + cx + Math.round(Math.cos(a) * s), CELL - 1 - h + Math.round(Math.sin(a) * s), s % 2 ? 0xe84a4a : 0xf8e8e0); }
    }
  }
  { // sea pens: a stalk and a feather of polyp leaves
    const ox = MC.seapen * CELL;
    for (const cx of [10, 21]) { for (let y = 0; y < 22; y++) set(ox + cx, CELL - 1 - y, y < 6 ? 0xa86a3a : 0xd88a4a); for (let y = 7; y < 21; y += 2) { const w = Math.round(Math.sin(((y - 7) / 14) * Math.PI) * 4) + 1; for (let k = 1; k <= w; k++) { set(ox + cx - k, CELL - 1 - y - (k > 2 ? 1 : 0), 0xe8a868); set(ox + cx + k, CELL - 1 - y - (k > 2 ? 1 : 0), 0xffc888); } } }
  }
  { // sponge nubs: chunky lobes with dark oscula
    const ox = MC.sponge * CELL;
    for (const [cx, h, c0, c1] of [[7, 9, 0xd86a2a, 0xffa860], [16, 13, 0x8a4ab0, 0xc890e8], [25, 7, 0xd8b030, 0xfff080]] as [number, number, number, number][]) {
      for (let y = 0; y < h; y++) for (let x = -2; x <= 2; x++) set(ox + cx + x, CELL - 1 - y, x < 0 ? c1 : c0);
      set(ox + cx, CELL - h, 0x2a1418); set(ox + cx + 1, CELL - h, 0x2a1418);
      for (let y = 2; y < h - 1; y += 3) set(ox + cx - 1, CELL - 1 - y, c0);
    }
  }
  { // shells and coral rubble
    const ox = MC.shells * CELL;
    for (let i = 0; i < 6; i++) {
      const x = Math.round(rng.range(3, CELL - 5)), pink = i % 2;
      for (let k = 0; k < 4; k++) { set(ox + x + k, CELL - 2, pink ? 0xe8a0a0 : 0xe8dcc4); set(ox + x + k, CELL - 3, pink ? 0xf8c8c0 : 0xf8f0e0); }
      set(ox + x + 1, CELL - 4, pink ? 0xf8c8c0 : 0xfff8f0); set(ox + x + 2, CELL - 4, pink ? 0xd88888 : 0xd8ccb4); set(ox + x, CELL - 1, 0x6a5a48);
    }
  }
  { // pebble litter
    const ox = MC.pebbles * CELL, PB = [0x6a6a66, 0x8a8a82, 0xaaa69a, 0x5a5650];
    for (let i = 0; i < 9; i++) { const x = Math.round(rng.range(2, CELL - 4)), c = PB[i % 4]; set(ox + x, CELL - 1, c); set(ox + x + 1, CELL - 1, c); set(ox + x, CELL - 2, 0xc8c4b8); set(ox + x + 1, CELL - 2, c); }
  }
  { // coral nubs: tiny branching heads
    const ox = MC.coralNub * CELL;
    for (const [cx, c0, c1] of [[9, 0xb09a72, 0xa0d0f0], [22, 0x9a7aa0, 0xe0d0ff]] as [number, number, number][]) {
      const br = (x: number, y: number, a: number, L: number, d: number) => { for (let s = 0; s < L; s++) { x += Math.sin(a); y -= Math.cos(a); set(ox + Math.round(x), Math.round(y), s === L - 1 && d > 1 ? c1 : c0); } if (d < 2) { br(x, y, a - 0.5, L - 2, d + 1); br(x, y, a + 0.5, L - 2, d + 1); } };
      br(cx, CELL - 1, 0, 6, 0);
    }
  }
  field(MC.whips, 6, 18, 30, [0x6a2a10, 0xa84a1a, 0xd87a2a, 0xf0a850], 1, 0.3);
  { // starfish + urchin litter
    const ox = MC.starLitter * CELL;
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; for (let s = 0; s < 4; s++) set(ox + 9 + Math.round(Math.cos(a) * s), CELL - 4 + Math.round(Math.sin(a) * s * 0.6), s < 3 ? 0xe0682a : 0xffa860); }
    disc(ox + 22, CELL - 3, 2.5, 0x3a1848, 0x6a3a7a);
    for (let k = 0; k < 8; k++) { const a = Math.PI * (1 + k / 7); set(ox + 22 + Math.round(Math.cos(a) * 4.5), CELL - 3 + Math.round(Math.sin(a) * 4.5), 0x8a5a9a); }
  }
  field(MC.deadGrass, 16, 4, 16, DEAD, 1, 0.55);
  { // sea lettuce sprouts: ruffled translucent green sheets
    const ox = MC.lettuce * CELL;
    for (let i = 0; i < 4; i++) { const cx = 6 + i * 7, h = rng.int(6, 11); for (let y = 0; y < h; y++) { const w = Math.round(Math.sin((y / h) * Math.PI) * 3 + 1 + (y % 3 === 0 ? 1 : 0)); for (let x = -w; x <= w; x++) set(ox + cx + x, CELL - 1 - y, Math.abs(x) === w ? 0xb8f080 : x < 0 ? 0x6ac048 : 0x48a03a); } }
  }
  { // tube worms: white tubes with red plumes
    const ox = MC.worms * CELL;
    for (let i = 0; i < 6; i++) { const cx = 4 + i * 4 + rng.int(0, 2), h = rng.int(6, 16); for (let y = 0; y < h; y++) { set(ox + cx, CELL - 1 - y, y % 4 === 0 ? 0xb8b0a0 : 0xe8e4d8); set(ox + cx + 1, CELL - 1 - y, 0xb8b0a0); } for (let k = -1; k <= 2; k++) { set(ox + cx + k, CELL - 1 - h, 0xe83a3a); set(ox + cx + k, CELL - 2 - h, k === 0 ? 0xff8a7a : 0xc82a2a); } }
  }
  { // hydroids: pale feathery stalks
    const ox = MC.hydroid * CELL;
    for (let i = 0; i < 4; i++) { const cx = 5 + i * 7, h = rng.int(10, 20); for (let y = 0; y < h; y++) { set(ox + cx, CELL - 1 - y, 0xc8b890); if (y > 3 && y % 2 === 0) { set(ox + cx - 1, CELL - 2 - y, 0xe8dcc0); set(ox + cx + 1, CELL - 2 - y, 0xfff4dc); } } }
  }
  { // bryozoan lace: a pale fenestrated fan
    const ox = MC.lace * CELL;
    for (let y = 0; y < 16; y++) for (let x = -8; x <= 8; x++) { if (x * x / 64 + (y - 16) * (y - 16) / 256 > 1) continue; if ((x + y) % 3 === 0 || y % 4 === 0) set(ox + 16 + x, CELL - 1 - y, x < 0 ? 0xf0e0d0 : 0xc8b8a8); }
  }
  { // kelp sprouts: young blades on a holdfast
    const ox = MC.kelpling * CELL;
    for (let i = 0; i < 5; i++) { const x = 9 + i * 3, h = rng.int(8, 18); blade(ox, x, h, (i - 2) * 0.25, BROWN, 2); }
    for (let x = 8; x < 24; x++) set(ox + x, CELL - 1, 0x3a2a14);
  }
  { // abyss glow nubs: bioluminescent cups and threads
    const ox = MC.glow * CELL;
    for (let i = 0; i < 6; i++) { const cx = 3 + i * 5, h = rng.int(4, 12), c = i % 2 ? 0x7cf8ff : 0xff6ae8; for (let y = 0; y < h; y++) set(ox + cx, CELL - 1 - y, y > h - 3 ? c : 0x2a3a5a); set(ox + cx - 1, CELL - h, c); set(ox + cx + 1, CELL - h, c); }
  }
  const t = p.texture({ mip: false });
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}
let TEX: THREE.Texture | null = null;

const VERT = /* glsl */ `
attribute vec4 iPos;    // xyz, rotation
attribute vec3 iData;   // size, cell, tint
uniform float uTime; uniform float uCells; uniform float uCurrent;
uniform vec4 uPushers[8]; uniform vec4 uBlast;
uniform sampler2D uSand; uniform vec4 uSandBox;
uniform vec2 uRetroRes; uniform float uRetroSnap;
varying vec2 vUv; varying vec3 vW; varying float vTint; varying float vH;
float sandDY(float x, float z) {
  if (uSandBox.w < 0.5) return 0.0;
  float f = clamp((x - uSandBox.x) / uSandBox.y, 0.0, uSandBox.z - 1.001);
  float i = floor(f), t = f - i;
  float a = texture2D(uSand, vec2((i + 0.5) / uSandBox.z, 0.5)).r, b = texture2D(uSand, vec2((i + 1.5) / uSandBox.z, 0.5)).r;
  return mix(a, b, t) * smoothstep(-2.6, -0.6, z);
}
void main() {
  vec3 p = position * iData.x;
  float c = cos(iPos.w), s = sin(iPos.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  vec3 base = iPos.xyz; base.y += sandDY(base.x, base.z);
  vec3 w = base + p;
  float h = position.y;
  // the current: a slow surge back and forth plus travelling gusts, squared by height
  float ph = base.x * 0.42 + base.z * 0.2 - uTime * 1.3;
  float gust = 0.55 + 0.45 * sin(base.x * 0.07 + base.z * 0.11 - uTime * 0.5);
  float surge = sin(uTime * 0.35 + base.x * 0.03) * 0.8;
  float sway = (sin(ph) * 0.5 + sin(ph * 2.3 + base.x * 3.0) * 0.2 + surge + uCurrent * 2.0) * gust;
  float hh = h * h * iData.x;
  w.x += sway * hh * 0.28; w.z += cos(ph * 0.7) * hh * 0.06;
  w.y -= abs(sway) * hh * 0.06;
  // pushers part the clumps; they spring back as soon as they pass
  for (int k = 0; k < 8; k++) {
    vec4 q = uPushers[k];
    vec2 d = w.xy - q.xy; float dl = length(d);
    float k2 = smoothstep(q.z + 0.6, q.z * 0.4, dl) * q.w * step(abs(base.z), 1.8);
    w.xy += (d / max(dl, 0.001)) * k2 * hh * 0.9; w.y -= k2 * hh * 0.25;
  }
  vec2 bd = w.xy - uBlast.xy; float bl = length(bd);
  float ring = exp(-pow(bl - uBlast.z * 9.0, 2.0) * 0.5) * exp(-uBlast.z * 1.6) * uBlast.w;
  w.xy += (bd / max(bl, 0.001)) * ring * hh * 2.0;
  vUv = vec2((iData.y + uv.x) / uCells, uv.y);
  vW = w; vTint = iData.z; vH = h;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (uRetroSnap > 0.0 && gl_Position.w > 0.0) { vec2 g = uRetroRes * 0.5 / uRetroSnap; gl_Position.xy = (floor(gl_Position.xy / gl_Position.w * g + 0.5) / g) * gl_Position.w; }
}`;

const FRAG = /* glsl */ `
uniform sampler2D uMap; uniform float uTime;
uniform vec3 uKey; uniform vec3 uAmbTop; uniform vec3 uAmbBot; uniform float uBright;
uniform vec3 uSunDir; uniform float uWaterY; uniform vec3 uDepthExt; uniform vec3 uDepthMin; uniform float uCaustic; uniform vec3 uCausticCol;
varying vec2 vUv; varying vec3 vW; varying float vTint; varying float vH;
float cf(vec2 p, float t) {
  vec2 i = p; float c = 1.0; float inten = 0.005;
  for (int n = 0; n < 3; n++) { float tt = t * (1.0 - (3.5 / float(n + 1))); i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x)); c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten))); }
  c /= 3.0; c = 1.17 - pow(c, 1.4); return clamp(pow(abs(c), 8.0), 0.0, 2.0);
}
float hsh(vec2 p) { return fract(sin(dot(floor(p), vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  float depth = max(0.0, uWaterY - vW.y);
  vec3 dl = max(exp(-uDepthExt * depth), uDepthMin);
  // caustics are the dapple
  vec2 q = (vW.xz - uSunDir.xz / max(uSunDir.y, 0.2) * depth) * 0.55;
  float dap = cf(q, uTime * 0.55) * exp(-depth * 0.045) * uCaustic;
  vec3 amb = mix(uAmbBot, uAmbTop, 0.25 + vH * 0.7);
  vec3 lit = amb + uKey * (0.55 + 0.35 * vH + dap * 0.8) * dl;
  // patchy hue across the meadow: some patches yellower, some bluer
  float pt = vn(vW.xz * 0.18) - 0.5;
  vec3 col = t.rgb * vTint * lit * uBright * (1.0 + vec3(0.12, 0.05, -0.1) * pt * 2.0);
  // backlit by the surface light: tips glow when you look up through them
  vec3 V = normalize(vW - cameraPosition);
  float back = pow(max(dot(V, uSunDir), 0.0), 4.0);
  col += t.rgb * uKey * back * (0.3 + vH) * 0.9 * dl;
  gl_FragColor = vec4(col, 1.0);
}`;

export interface MeadowItem { x: number; y: number; z: number; rot: number; size: number; cell: number; tint: number }

/** an instanced field of crossed-quad clumps */
export function makeMeadow(items: MeadowItem[]): THREE.Mesh {
  const P: number[] = [], U: number[] = [], I: number[] = [];
  for (let q = 0; q < 2; q++) {
    const a = q * Math.PI / 2 + 0.3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, o = P.length / 3;
    P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    U.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const n = items.length, pos = new Float32Array(n * 4), dat = new Float32Array(n * 3);
  const box = new THREE.Box3(), v = new THREE.Vector3();
  items.forEach((it, i) => {
    pos[i * 4] = it.x; pos[i * 4 + 1] = it.y; pos[i * 4 + 2] = it.z; pos[i * 4 + 3] = it.rot;
    dat[i * 3] = it.size; dat[i * 3 + 1] = it.cell; dat[i * 3 + 2] = it.tint;
    box.expandByPoint(v.set(it.x, it.y, it.z));
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 3));
  g.instanceCount = n;
  box.expandByScalar(2.5);
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  if (!TEX) TEX = atlas();
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: TEX }, uCells: { value: NCELL }, uTime: UW.uTime, uCurrent: ENV.uCurrent,
      uPushers: MEADOW.uPushers, uBlast: ENV.uBlast, uSand: ENV.uSand, uSandBox: ENV.uSandBox,
      uRetroRes: RETRO.uRes, uRetroSnap: RETRO.uSnap,
      uKey: MEADOW.uKey, uAmbTop: MEADOW.uAmbTop, uAmbBot: MEADOW.uAmbBot, uBright: MEADOW.uBright,
      uSunDir: UW.uSunDir, uWaterY: UW.uWaterY, uDepthExt: UW.uDepthExt, uDepthMin: UW.uDepthMin, uCaustic: UW.uCaustic, uCausticCol: UW.uCausticCol,
    },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.name = 'meadow';
  return m;
}

/** bin items into x chunks (metres) so off-screen chunks are culled */
export function makeMeadowChunked(items: MeadowItem[], cell = 14): THREE.Group {
  const bins = new Map<number, MeadowItem[]>();
  for (const it of items) { const k = Math.floor(it.x / cell); const l = bins.get(k) ?? []; l.push(it); bins.set(k, l); }
  const grp = new THREE.Group();
  for (const list of bins.values()) grp.add(makeMeadow(list));
  return grp;
}

/** match the meadow's light to the area's look */
export function meadowLook(sun: string, sunI: number, hemiSky: string, hemiGround: string, hemi: number) {
  MEADOW.uKey.value.set(sun).multiplyScalar(sunI * 0.42);
  MEADOW.uAmbTop.value.set(hemiSky).multiplyScalar(hemi * 0.75);
  MEADOW.uAmbBot.value.set(hemiGround).multiplyScalar(hemi * 0.9);
}
