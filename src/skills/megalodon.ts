// The Wind-Up Megalodon: you toss a clockwork toy shark that chatters off toward the enemy... and something
// much bigger smells it. A 9 m PS1-style megalodon (500-odd faceted polys, a 256 px realistic pixel skin:
// countershaded slate back over a white belly with a ragged waterline, scars, gill slits, snout pores, rolled-back
// eyes when it bites, rows of serrated teeth) rumbles up from the side, gapes, swallows the toy and sweeps the
// whole crowd in one pass (a second, higher pass at level 2+), then dives away.
//
//   new MegalodonSummon(w, caster, aimX, aimY, level, power)   (the 'megalodon' skill does this)
//   buildMegalodon(9)                                         the model alone: { root, jaw, eyes, U } (previews)
import * as THREE from 'three';
import type { Entity, World, Team } from '../game/types';
import type { SkillCaster } from './types';
import { Loft, usFor, type V3 } from '../gfx/loft';
import { Px, type RGB } from '../gfx/px';
import { T, tone, rect } from './texkit';
import { hash2, TAU, clamp01, smooth } from '../core/math';
import { psxMat, mesh, facet, xf } from '../player/psx';
import { foes, strike } from './combat';
import { FX, emit } from './fx';

// ------------------------------------------------------------------ profile (t: 0 tail .. 1 snout), units of L
const ST: [number, number, number, number, number][] = [
  // t, top, bottom, half-width, centre y
  [0.0, 0.022, 0.022, 0.016, 0.0], [0.08, 0.036, 0.034, 0.027, 0.0], [0.2, 0.068, 0.062, 0.054, 0.0], [0.35, 0.112, 0.104, 0.09, 0.0],
  [0.5, 0.137, 0.132, 0.113, 0.0], [0.62, 0.144, 0.138, 0.12, 0.0], [0.74, 0.134, 0.12, 0.112, 0.004], [0.84, 0.11, 0.072, 0.094, 0.014],
  [0.91, 0.078, 0.04, 0.068, 0.02], [0.96, 0.044, 0.02, 0.038, 0.024], [0.99, 0.014, 0.008, 0.012, 0.022],
];
function at(t: number) {
  let i = 0; while (i < ST.length - 2 && t > ST[i + 1][0]) i++;
  const a = ST[i], b = ST[i + 1], k = smooth(0, 1, (t - a[0]) / (b[0] - a[0]));
  return { top: a[1] + (b[1] - a[1]) * k, bot: a[2] + (b[2] - a[2]) * k, wid: a[3] + (b[3] - a[3]) * k, cy: a[4] + (b[4] - a[4]) * k };
}
const X = (t: number) => t - 0.58;

// ------------------------------------------------------------------ skin pages
let skinCache: { real: THREE.Texture; toy: THREE.Texture } | null = null;
function skins() {
  if (skinCache) return skinCache;
  const W = 256, H = 128, BH = 96;
  const paint = (toy: boolean) => {
    const p = new Px(W, H);
    const back = toy ? T.blue : T.shark, belly = T.belly;
    for (let y = 0; y < BH; y++) for (let x = 0; x < W; x++) {
      const u = x / W, t = 1 - (y + 0.5) / BH;
      const up = -Math.cos(u * TAU);
      // the countershading line: a deliberate long wave, higher on the head, dipping under the pectorals
      const line = toy ? -0.05 : -0.14 + Math.sin(t * 13 + u * 3) * 0.06 + smooth(0.75, 0.95, t) * 0.14 - smooth(0.55, 0.68, t) * smooth(0.82, 0.7, t) * 0.12;
      let c: RGB;
      if (up > line) {
        const d = up - line;
        c = tone(back, d < 0.06 ? 4 : up > 0.62 ? 1 : up > 0.18 ? 2 : 3);
      } else c = tone(belly, up < -0.75 ? 4 : up < line - 0.08 ? 3 : 2);
      p.set(x, y, c);
    }
    if (!toy) {
      // a few big darker blotches on the back, painted as clean shapes
      for (const [x, y, rx, ry] of [[128, 30, 10, 4], [118, 52, 7, 3], [136, 64, 6, 3], [122, 14, 5, 2], [134, 42, 4, 2]]) p.ellipse(x, y, rx, ry, tone(back, 1));
      // scars: pale scratches with a dark lower lip
      for (const [x0, y0, x1, y1] of [[96, 40, 112, 46], [140, 22, 158, 18], [104, 60, 114, 62], [150, 50, 164, 56], [86, 28, 94, 34]]) { p.line(x0, y0, x1, y1, '#b8c4cc'); p.line(x0, y0 + 1, x1, y1 + 1, '#0e141c'); }
      // gill slits: five dark crescents on each flank
      for (const s of [0.22, 0.78]) for (let g = 0; g < 5; g++) {
        const gx = Math.round(s * W), gy = Math.round((1 - (0.72 + g * 0.022)) * BH);
        for (let dx = -10; dx <= 10; dx++) { const yy = gy + Math.round((dx * dx) / 55); p.set(gx + dx, yy, '#06090e'); p.set(gx + dx, yy + 1, '#06090e'); p.set(gx + dx, yy - 1, tone(back, 3)); }
      }
      // ampullae: rows of pores on the snout
      for (let r = 0; r < 3; r++) for (let x = 100 + r * 4; x < 156; x += 7) p.set(x, 2 + r * 2, '#0e141c');
    } else {
      // painted tin: rivet rows and a red racing stripe
      for (let y = 6; y < BH; y += 12) for (let x = 4; x < W; x += 10) { p.set(x, y, '#e0e8f0'); p.set(x + 1, y + 1, tone(T.blue, 0)); }
      for (let x = 0; x < W; x++) if (Math.abs(x / W - 0.25) < 0.06 || Math.abs(x / W - 0.75) < 0.06) rect(p, x, 40, 1, 5, tone(T.red, 3));
    }
    // fins (0, 96, 128, 32): back tone, a darker trailing edge and tips
    for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) p.set(x, 96 + y, tone(back, y > 26 || x > 118 ? 0 : y > 18 ? 1 : 2));
    // mouth (128, 96, 64, 32): gum bands and palate ridges
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) p.set(128 + x, 96 + y, tone(['#1a0206', '#4a0812', '#8a1a28', '#c8485a', '#f08a98'], y < 6 ? 3 : x % 8 === 0 ? 1 : y < 20 ? 2 : 1));
    // teeth (192, 96, 16, 32): ivory with a darker serrated edge
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(192 + x, 96 + y, tone(T.bone, x < 2 || x > 13 ? (y % 3 === 0 ? 2 : 3) : y > 24 ? 3 : 4));
    // eye (208, 96): black with a glint; (224, 96): rolled back white
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      p.set(208 + x, 96 + y, d < 6 ? '#040608' : '#1a222a');
      p.set(224 + x, 96 + y, d < 6 ? (d < 4 ? '#e8e4dc' : '#b0aaa0') : '#1a222a');
    }
    p.rect(212, 99, 2, 2, '#a8b4c0'); p.set(214, 101, '#5a6470');
    return p.texture({ mip: false });
  };
  skinCache = { real: paint(false), toy: paint(true) };
  return skinCache;
}
const REG = { body: { x: 0, y: 0, w: 1, h: 0.75 }, fin: { x: 0, y: 0.75, w: 0.5, h: 0.25 }, mouth: { x: 0.5, y: 0.75, w: 0.25, h: 0.25 }, teeth: { x: 0.75, y: 0.75, w: 1 / 16, h: 0.25 }, eye: { x: 13 / 16, y: 0.75, w: 1 / 16, h: 0.125 }, eyeRoll: { x: 14 / 16, y: 0.75, w: 1 / 16, h: 0.125 } };

// ------------------------------------------------------------------ geometry (unit length, scaled by the caller)
let geoCache: { body: THREE.BufferGeometry; fins: THREE.BufferGeometry; jaw: THREE.BufferGeometry; teethU: THREE.BufferGeometry; teethL: THREE.BufferGeometry; throat: THREE.BufferGeometry } | null = null;
function geos() {
  if (geoCache) return geoCache;
  const NS = 8;
  const us = usFor(NS);
  const ts = [0.0, 0.07, 0.16, 0.28, 0.42, 0.56, 0.68, 0.78, 0.86, 0.92, 0.96, 0.99];
  const pt = (t: number, u: number, jawCut = true): V3 => {
    const p = at(t), a = u * TAU, s = Math.sin(a), c = -Math.cos(a);
    // the mouth: in front of the hinge the lower head is carved away (the jaw fills it)
    let bot = p.bot;
    if (jawCut && t > 0.8) bot = Math.min(bot, 0.012 + (1 - smooth(0.8, 0.86, t)) * p.bot);
    const ry = c >= 0 ? p.top : bot;
    // a slightly keeled back and a flattened belly: sharks are not round
    const e = c >= 0 ? 0.9 : 1.15;
    return [X(t), p.cy + Math.sign(c) * Math.pow(Math.abs(c), e) * ry, Math.sign(s) * Math.pow(Math.abs(s), 0.9) * p.wid];
  };
  const L = new Loft();
  L.loft(ts.map((t) => ({ pts: us.map((u) => pt(t, u)), v: t })), us, REG.body, 0, { start: [X(0) - 0.004, 0, 0], end: [X(1), at(0.99).cy, 0], alt: true });
  const body = facet(L.build());
  // fins: thin double-sided prisms
  const F = new Loft();
  /** a fin quad: row0 = the base edge, row1 = the far edge (repeat a point for a triangle) */
  const fin = (b0: V3, b1: V3, r0: V3, r1: V3, th = 0.006) => F.sheet([[b0, b1], [r0, r1]], REG.fin, -1, undefined, th);
  const top = (t: number) => at(t).cy + at(t).top;
  const D1: V3 = [X(0.42), top(0.5) + 0.15, 0];
  fin([X(0.46), top(0.46) - 0.01, 0], [X(0.62), top(0.62) - 0.01, 0], D1, [X(0.53), top(0.55) + 0.09, 0], 0.008); // first dorsal
  const D2: V3 = [X(0.1), top(0.14) + 0.035, 0];
  fin([X(0.12), top(0.12) - 0.005, 0], [X(0.18), top(0.18) - 0.005, 0], D2, D2); // second dorsal
  for (const s of [-1, 1]) {
    fin([X(0.6), -0.09, s * 0.09], [X(0.7), -0.08, s * 0.085], [X(0.44), -0.2, s * 0.3], [X(0.55), -0.125, s * 0.2], 0.008); // pectorals
    const pv: V3 = [X(0.22), -0.1, s * 0.08];
    fin([X(0.26), -0.05, s * 0.04], [X(0.31), -0.06, s * 0.045], pv, pv); // pelvics
  }
  const an: V3 = [X(0.08), -0.075, 0];
  fin([X(0.1), -0.03, 0], [X(0.15), -0.04, 0], an, an); // anal
  // the lunate tail: upper lobe bigger
  fin([X(-0.005), -0.004, 0], [X(0.02), 0.014, 0], [X(-0.13), 0.21, 0], [X(-0.05), 0.11, 0], 0.008);
  fin([X(-0.005), 0.004, 0], [X(0.02), -0.014, 0], [X(-0.11), -0.16, 0], [X(-0.045), -0.075, 0], 0.008);
  const fins = facet(F.build());
  // lower jaw: a wedge hinged at the origin (placed at the hinge by the caller), chin at +x
  const J = new Loft();
  const jus = usFor(6);
  const jt = [0, 0.25, 0.5, 0.75, 0.92, 1];
  const jlen = X(0.975) - X(0.79);
  J.loft(jt.map((k) => {
    const t = 0.79 + k * 0.185, p = at(t);
    const w = p.wid * (1 - k * 0.25) * 0.98, d = (0.05 + (1 - k) * 0.03) * (1 - k * k * 0.6);
    return { pts: jus.map((u) => { const a = u * Math.PI; return [k * jlen, -Math.sin(a) * d, Math.cos(a) * w] as V3; }), v: k };
  }), jus, REG.body, -1, { end: [jlen + 0.004, -0.008, 0] });
  // the mouth floor (tongue side) across the top of the jaw
  const fl: V3[][] = [];
  for (let i = 0; i <= 4; i++) { const k = i / 4, t = 0.79 + k * 0.18, w = at(t).wid * (1 - k * 0.25) * 0.95; fl.push([[k * jlen, -0.004, -w], [k * jlen, -0.012, 0], [k * jlen, -0.004, w]]); }
  J.sheet(fl, REG.mouth, -1);
  const jaw = facet(J.build());
  // throat: a dark pouch inside the upper head behind the teeth
  const T = new Loft();
  T.loft([0.8, 0.86, 0.92, 0.96].map((t, i) => { const p = at(t), w = p.wid * 0.85; return { pts: jus.map((u) => { const a = u * Math.PI; return [X(t), p.cy - 0.01 + Math.sin(a) * p.top * 0.45, Math.cos(a) * w] as V3; }), v: i / 3 }; }), jus, REG.mouth, -1, { flip: true });
  const throat = facet(T.build());
  // teeth: big serrated triangles along the upper rim and the jaw rim
  const tooth = (base: V3, dir: number, size: number, out: number[]) => {
    const [x, y, z] = base;
    const w = size * 0.55;
    const tri: V3[] = [[x - w, y, z], [x + w, y, z], [x, y + dir * size, z + Math.sign(z) * size * 0.08]];
    const tri2: V3[] = [[x + w, y, z], [x - w, y, z], [x, y + dir * size, z - Math.sign(z || 1) * 0.004]];
    for (const v of [...tri, ...tri2]) out.push(...v);
  };
  const up: number[] = [], lo: number[] = [];
  for (let k = 0; k <= 9; k++) {
    const t = 0.82 + (k / 9) * 0.165, p = at(t);
    const w = p.wid * 0.93;
    const size = 0.03 * (1 - k / 18);
    for (const s of [-1, 1]) tooth([X(t), p.cy - 0.012, s * w * (1 - (k / 9) * 0.35)], -1, size, up);
    const kk = k / 9;
    const jw = at(0.79 + kk * 0.185).wid * (1 - kk * 0.25) * 0.94;
    for (const s of [-1, 1]) tooth([kk * jlen, -0.002, s * jw], 1, size * 0.9, lo);
  }
  const mk = (arr: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const uv: number[] = [];
    for (let i = 0; i < arr.length / 9; i++) uv.push(REG.teeth.x, 1 - REG.teeth.y - REG.teeth.h, REG.teeth.x + REG.teeth.w, 1 - REG.teeth.y - REG.teeth.h, REG.teeth.x + REG.teeth.w / 2, 1 - REG.teeth.y);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  geoCache = { body, fins, jaw, teethU: mk(up), teethL: mk(lo), throat };
  return geoCache;
}

export interface MegalodonModel { root: THREE.Group; body: THREE.Group; jaw: THREE.Group; eyes: THREE.Mesh[]; U: { uSwimT: { value: number }; uSwimA: { value: number } }; open(k: number): void; roll(k: number): void }

/** the megalodon model, length in metres; toy = the painted tin wind-up version */
export function buildMegalodon(length = 9, toy = false): MegalodonModel {
  const g = geos(), sk = skins();
  const map = toy ? sk.toy : sk.real;
  const U = { uSwimT: { value: 0 }, uSwimA: { value: 0.06 } };
  const swim = (m: THREE.Material, key: string) => {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uSwimT; uniform float uSwimA;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { float tt = clamp((0.22 - position.x) / 0.85, 0.0, 1.3); transformed.z += sin(uSwimT - position.x * 6.0) * uSwimA * tt * tt; }`);
    };
    const pk = m.customProgramCacheKey.bind(m);
    m.customProgramCacheKey = () => pk() + 'megaSwim' + key;
    return m;
  };
  const skin = swim(psxMat(map, { rough: toy ? 0.3 : 0.55, metal: toy ? 0.5 : 0, rim: 0.2 }), toy ? 't' : 'r');
  const finM = swim(psxMat(map, { rough: 0.6, metal: toy ? 0.5 : 0, side: THREE.DoubleSide }), toy ? 'tf' : 'rf');
  const plain = psxMat(map, { rough: 0.5, side: THREE.DoubleSide, flat: true });
  const teethM = psxMat(map, { rough: 0.35, side: THREE.DoubleSide });
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  body.add(mesh(g.body, skin), mesh(g.fins, finM), mesh(g.throat, plain, false), mesh(g.teethU, teethM, false));
  const jaw = new THREE.Group();
  jaw.position.set(X(0.79), at(0.79).cy - 0.022, 0);
  jaw.add(mesh(g.jaw, plain), mesh(g.teethL, teethM, false));
  body.add(jaw);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const eg = new THREE.OctahedronGeometry(0.012, 0);
    const uv = eg.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, REG.eye.x + uv.getX(i) * REG.eye.w, 1 - REG.eye.y - REG.eye.h + uv.getY(i) * REG.eye.h);
    const e = mesh(eg, psxMat(map, { rough: 0.05, metal: 0.3 }), false);
    const p = at(0.9);
    e.position.set(X(0.9), p.cy + p.top * 0.28, s * (p.wid + 0.004));
    e.scale.set(1, 1, 0.5);
    body.add(e); eyes.push(e);
  }
  if (toy) {
    // the brass wind-up key on its back
    const key = new THREE.Group(); key.name = 'key';
    const brass = psxMat(null, { color: '#d8a030', metal: 0.85, rough: 0.3 });
    key.add(mesh(facet(xf(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 5), [0, 0.04, 0])), brass, false));
    for (const s of [-1, 1]) key.add(mesh(facet(xf(new THREE.TorusGeometry(0.03, 0.009, 4, 6), [0, 0.1, s * 0.03], [0, Math.PI / 2, 0])), brass, false));
    key.position.set(X(0.5), at(0.5).top, 0);
    body.add(key);
  }
  root.scale.setScalar(length);
  const rolledMat = psxMat(map, { rough: 0.3 });
  rolledMat.map = map.clone(); rolledMat.map.offset.set(REG.eyeRoll.x - REG.eye.x, 0); rolledMat.map.needsUpdate = true;
  const eyeMat = eyes[0].material;
  return {
    root, body, jaw, eyes, U,
    open: (k: number) => { jaw.rotation.z = -clamp01(k) * 0.75; },
    roll: (k: number) => { for (const e of eyes) e.material = k > 0.5 ? rolledMat : eyeMat; },
  };
}

// ------------------------------------------------------------------ the summon
export class MegalodonSummon implements Entity {
  kind = 'megalodon'; team: Team = 'friend';
  x: number; y: number; vx = 0; vy = 0; r = 1.2; alive = true;
  obj = new THREE.Group();
  private toy = buildMegalodon(0.6, true);
  private shark = buildMegalodon(12);
  private t = 0;
  private phase: 'toy' | 'rumble' | 'pass' | 'leave' = 'toy';
  private tx: number; private ty: number; private dir: number;
  private toyX: number; private toyY: number; private toyVx: number; private toyVy: number;
  private passes: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; d: THREE.Vector3; dur: number }[] = [];
  private pi = 0; private pt = 0;
  private bitten = new Set<Entity>();
  private shark3 = new THREE.Vector3(); private prev3 = new THREE.Vector3();
  private chompT = 0; private toyEaten = false; private clickT = 0;
  constructor(w: World, public p: SkillCaster, aimX: number, aimY: number, public lv = 1, public power = 1) {
    this.dir = Math.sign(aimX - p.x) || p.facing || 1;
    this.tx = aimX; this.ty = Math.min(aimY, w.water.heightAt(aimX) - 1.2);
    this.x = this.toyX = p.x + this.dir * 0.4; this.y = this.toyY = p.y;
    const d = Math.hypot(this.tx - this.toyX, this.ty - this.toyY) || 1;
    this.toyVx = ((this.tx - this.toyX) / d) * 3.2; this.toyVy = ((this.ty - this.toyY) / d) * 3.2;
    this.obj.add(this.toy.root, this.shark.root);
    this.shark.root.visible = false;
    w.text.pop('WIND... WIND... WIND...', p.x, p.y + 1.1, 'hint', { size: 0.26 });
    w.sfx('clk', p.x, 0.7, 0.8);
  }
  private buildPasses(w: World) {
    const D = this.dir, cx = this.toyX, cy = this.toyY;
    const floor = w.terrain.floorAt(cx);
    const y0 = Math.max(floor + 1.6, cy - 1.8);
    this.passes.push({ a: new THREE.Vector3(cx - D * 22, y0 - 1.5, -5), b: new THREE.Vector3(cx - D * 9, y0 - 0.8, -1.2), c: new THREE.Vector3(cx - D * 2, cy, 0.6), d: new THREE.Vector3(cx + D * 24, cy + 1.6, -3), dur: 2.6 });
    if (this.lv >= 2) {
      const y2 = Math.min(w.water.heightAt(cx) - 1.5, cy + 2.2);
      this.passes.push({ a: new THREE.Vector3(cx + D * 24, y2 + 1, -4), b: new THREE.Vector3(cx + D * 8, y2, 0.6), c: new THREE.Vector3(cx - D * 4, y2 - 0.6, 0.6), d: new THREE.Vector3(cx - D * 26, y2 - 2.5, -4), dur: 2.4 });
    }
  }
  private bez(P: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; d: THREE.Vector3 }, t: number, out: THREE.Vector3) {
    const u = 1 - t;
    return out.set(0, 0, 0).addScaledVector(P.a, u * u * u).addScaledVector(P.b, 3 * u * u * t).addScaledVector(P.c, 3 * u * t * t).addScaledVector(P.d, t * t * t);
  }
  update(dt: number, w: World) {
    this.t += dt;
    // ---- the toy chatters toward the aim point
    if (!this.toyEaten) {
      if (this.phase === 'toy') { this.toyX += this.toyVx * dt; this.toyY += this.toyVy * dt + Math.sin(this.t * 14) * 0.01; if (Math.hypot(this.tx - this.toyX, this.ty - this.toyY) < 0.3) { this.toyVx *= 0.9; this.toyVy *= 0.9; } }
      else { this.toyVx *= Math.exp(-dt * 3); this.toyX += this.toyVx * dt; this.toyY += Math.sin(this.t * 3) * 0.004; }
      this.toy.root.position.set(this.toyX, this.toyY, 0.4);
      this.toy.root.rotation.set(0, this.dir > 0 ? -0.5 : Math.PI + 0.5, Math.sin(this.t * 18) * 0.12);
      this.toy.open(0.5 + Math.sin(this.t * 22) * 0.5);
      this.toy.U.uSwimT.value += dt * 26; this.toy.U.uSwimA.value = 0.08;
      const key = this.toy.body.getObjectByName('key'); if (key) key.rotation.x += dt * 14;
      this.clickT -= dt;
      if (this.clickT <= 0) { this.clickT = 0.12; w.sfx('clk', this.toyX, 0.25, 1.6 + Math.random() * 0.3); }
      if (Math.random() < dt * 10) emit(w, 'bubble', this.toyX - this.dir * 0.3, this.toyY, { size: 0.06, life: 1 });
    }
    // ---- phases
    if (this.phase === 'toy' && this.t > 1.25) { this.phase = 'rumble'; this.t = 0; w.sfx('uw_rumble1', this.toyX, 1); w.sfx('boss_growl', this.toyX, 0.7, 0.6); w.text.pop('...?', this.toyX, this.toyY + 0.6, 'hint', { size: 0.3 }); }
    if (this.phase === 'rumble') {
      w.game.addShake(0.04 + this.t * 0.1);
      if (Math.random() < dt * 30) emit(w, 'bubble', this.toyX - this.dir * (8 + Math.random() * 6), this.toyY - 2 + Math.random() * 3, { size: 0.12, vy: 1, life: 2 });
      if (this.t > 0.7) { this.phase = 'pass'; this.t = 0; this.buildPasses(w); this.shark.root.visible = true; w.sfx('roar', this.toyX, 1, 0.7); w.text.pop('MEGALODON!', (this.toyX + this.p.x) / 2, Math.max(this.toyY, this.p.y) + 1.8, 'title', { size: 0.8, life: 2.2 }); }
    }
    if (this.phase === 'pass') this.updatePass(dt, w);
    if (this.phase === 'leave') { this.alive = false; }
    this.x = this.shark3.x || this.toyX; this.y = this.shark3.y || this.toyY;
  }
  private updatePass(dt: number, w: World) {
    const P = this.passes[this.pi];
    this.pt += dt / P.dur;
    const k = Math.min(1, this.pt);
    // ease in-out a touch so it lunges through the middle
    const e = k < 0.5 ? 0.5 * Math.pow(k * 2, 1.25) : 1 - 0.5 * Math.pow((1 - k) * 2, 1.25);
    this.prev3.copy(this.shark3);
    this.bez(P, e, this.shark3);
    if (this.pt * P.dur < dt * 1.5) this.prev3.copy(this.bez(P, Math.max(0, e - 0.01), new THREE.Vector3()));
    const v = this.shark3.clone().sub(this.prev3);
    const sp = v.length() / dt;
    const goingRight = v.x >= 0;
    const S = this.shark.root;
    S.position.copy(this.shark3);
    const pitch = Math.atan2(v.y, Math.abs(v.x) + 1e-4);
    S.rotation.set(0, goingRight ? -0.35 : Math.PI + 0.35, 0);
    this.shark.body.rotation.set(Math.sin(this.pt * 9) * 0.06, 0, pitch * 0.8);
    this.shark.U.uSwimT.value += dt * (6 + sp * 0.35);
    this.shark.U.uSwimA.value = 0.07;
    // mouth: gapes as it closes in on something, snaps shut on contact
    const fwd = new THREE.Vector3(goingRight ? 1 : -1, 0, 0);
    const mouth = S.localToWorld(new THREE.Vector3(0.38, -0.03, 0));
    let prey = false;
    for (const f of foes(w, mouth.x + fwd.x * 2.5, mouth.y, 3.5)) if (!this.bitten.has(f)) prey = true;
    if (!this.toyEaten && Math.abs(mouth.x - this.toyX) < 4) prey = true;
    this.chompT -= dt;
    const want = this.chompT > 0 ? 0 : prey ? 1 : 0.25;
    const cur = -this.shark.jaw.rotation.z / 0.75;
    this.shark.open(cur + (want - cur) * Math.min(1, dt * (want > cur ? 9 : 30)));
    this.shark.roll(cur > 0.6 ? 1 : 0);
    // bites
    const bite = (x: number, y: number) => { this.chompT = 0.22; w.sfx('chomp1', x, 1, 0.6); w.sfx('crunch1', x, 0.9, 0.8); w.game.freeze(0.07); w.game.addShake(0.45); FX.light(w, x, y, '#ffffff', 6, 0.1); };
    if (!this.toyEaten && Math.hypot(mouth.x - this.toyX, mouth.y - this.toyY) < 1.6) {
      this.toyEaten = true; this.toy.root.visible = false; bite(this.toyX, this.toyY);
      w.fx.debrisBurst(this.toyX, this.toyY, 12, '#d8a030', 4, 0.05); FX.sparks(w, this.toyX, this.toyY, 14, undefined, 5, '#ffe0a0');
    }
    for (const f of foes(w, mouth.x, mouth.y, 2.2)) {
      if (this.bitten.has(f)) continue;
      this.bitten.add(f);
      strike(w, this.p, f, 14 * this.power, fwd.x, 0.2, 'bite', { gore: 2.6, crit: false });
      bite(f.x, f.y);
      FX.gore(w, f.x, f.y, 2.2, { x: fwd.x, y: 0.3 });
    }
    // the body bulldozes whatever the jaws missed
    for (let s = 0.0; s <= 1; s += 0.25) {
      const bp = S.localToWorld(new THREE.Vector3(0.3 - s * 0.7, 0, 0));
      for (const f of foes(w, bp.x, bp.y, 1.1 + (1 - s) * 0.4)) {
        if (this.bitten.has(f)) continue;
        this.bitten.add(f);
        strike(w, this.p, f, 4 * this.power, fwd.x, 0.8, 'crush', { gore: 0.6 });
        f.vx += fwd.x * 8; f.vy += 5;
      }
    }
    // churn: bubbles from the gills and tail, silt when it skims the seabed
    const tail = S.localToWorld(new THREE.Vector3(-0.55, 0, 0));
    if (Math.random() < dt * 40) emit(w, 'bubble', tail.x, tail.y, { spread: 0.6, speed: 1.5, size: 0.12, life: 2 });
    const gill = S.localToWorld(new THREE.Vector3(0.2, -0.02, 0));
    if (Math.random() < dt * 20) emit(w, 'bubbleBig', gill.x, gill.y, { spread: 0.4, speed: 1, size: 0.2, life: 2 });
    if (this.shark3.y - w.terrain.floorAt(this.shark3.x) < 2.2 && Math.random() < dt * 10) FX.silt(w, this.shark3.x, w.terrain.floorAt(this.shark3.x) + 0.1, 6, 1.2);
    if (Math.abs(this.shark3.x - this.p.x) < 10) w.game.addShake(0.05);
    if (this.pt >= 1) {
      this.pi++; this.pt = 0; this.bitten.clear();
      if (this.pi >= this.passes.length) { this.phase = 'leave'; this.shark.root.visible = false; }
      else { w.sfx('roar', this.shark3.x, 0.8, 0.8); }
    }
  }
}
void hash2;
