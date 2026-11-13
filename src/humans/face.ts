// Expressive cartoony-realistic faces. Instead of repainting a face texture per expression (Limbophobia's
// FacePainter), the readable parts are their own little rigs on the head bone:
//   - real eyeballs with painted irises + catchlights, aimed at whatever the fisherman looks at;
//   - upper / lower eyelids: skin shells that swing round the eyeball (blink, squint, wide) and tilt
//     (angry / sad), with a dark lash line on their edge;
//   - lofted brows that lift, drop, tilt and knit;
//   - a mouth decal hugging the muzzle whose UVs switch between 16 painted mouth shapes on the page;
//   - a face flush (angry red / strained) through the material's emissive tint.
// Expressions blend smoothly (all scalars are springs), with automatic blinking and saccades.
import * as THREE from 'three';
import type { V3 } from '../gfx/loft';
import { Loft } from '../gfx/loft';
import { Px, mix, shade } from '../gfx/px';
import type { RGB } from '../gfx/px';
import type { HeadShape } from './head';
import type { Look } from './looks';
import { R, mouthReg, MOUTHS, MOUTH_FW, MOUTH_FH, LAYOUT } from './page';
import type { MouthFrame } from './page';
import { skinPx } from './paint';
import { band } from './fabric';
import { clamp01, lp } from './rig';

export type ExprName = 'neutral' | 'happy' | 'grin' | 'laugh' | 'angry' | 'furious' | 'sad' | 'surprised' | 'scared' | 'strain' | 'focus'
  | 'bored' | 'smug' | 'dazed' | 'worried' | 'sleepy' | 'concentrate' | 'yell' | 'ooh' | 'pout';
export interface Expr { up: number; lo: number; tilt: number; browY: number; browT: number; knit: number; mouth: MouthFrame; red: number; pupil: number; talk?: boolean }
const E = (up: number, lo: number, tilt: number, browY: number, browT: number, knit: number, mouth: MouthFrame, red = 0, pupil = 1, talk = false): Expr => ({ up, lo, tilt, browY, browT, knit, mouth, red, pupil, talk });
/** up / lo: lid edge elevation in degrees (above / below the eye's centre); tilt + = angry (inner corners down) */
export const EXPRS: Record<ExprName, Expr> = {
  neutral: E(34, -40, 0, 0, 0, 0, 'neutral'),
  happy: E(26, -18, -0.05, 0.35, -0.1, 0, 'smile'),
  grin: E(22, -12, -0.05, 0.4, -0.15, 0, 'grin'),
  laugh: E(14, -6, -0.1, 0.6, -0.2, 0, 'laugh', 0.15),
  angry: E(20, -28, 0.32, -0.55, 0.55, 0.6, 'frown', 0.25),
  furious: E(18, -24, 0.42, -0.8, 0.75, 0.9, 'yell', 0.6, 0.8, true),
  yell: E(22, -30, 0.3, -0.5, 0.55, 0.6, 'yell', 0.35, 0.9, true),
  sad: E(24, -36, -0.3, 0.2, -0.55, 0.3, 'frown'),
  surprised: E(62, -58, 0, 1, 0, 0, 'O', 0, 0.75),
  scared: E(58, -54, -0.2, 0.8, -0.45, 0.4, 'gasp', 0, 0.6),
  strain: E(10, -12, 0.25, -0.45, 0.4, 0.8, 'grit', 0.45),
  focus: E(24, -28, 0.12, -0.2, 0.2, 0.3, 'flat'),
  bored: E(14, -38, -0.05, -0.1, 0, 0, 'flat', 0, 1),
  smug: E(18, -26, 0.08, 0.15, 0.1, 0, 'smirk'),
  dazed: E(16, -30, -0.12, 0.3, -0.3, 0, 'wavy'),
  worried: E(36, -36, -0.25, 0.45, -0.5, 0.4, 'wavy'),
  sleepy: E(4, -34, -0.1, -0.1, 0, 0, 'flat'),
  concentrate: E(22, -24, 0.1, -0.25, 0.25, 0.35, 'tongue'),
  ooh: E(40, -44, -0.05, 0.6, -0.1, 0, 'ooh'),
  pout: E(26, -34, -0.15, 0.1, -0.3, 0.2, 'pout'),
};

// ------------------------------------------------------------------ eye texture (cached per iris colour)
const eyeCache = new Map<string, THREE.MeshStandardMaterial>();
function eyeMaterial(iris: RGB, kid: boolean): THREE.MeshStandardMaterial {
  const key = iris.map((v) => v | 0).join(',') + (kid ? 'k' : '');
  const hit = eyeCache.get(key);
  if (hit) return hit;
  const N = 64, p = new Px(N, N);
  const c = N / 2;
  const irisR = kid ? 19 : 17, pupR = kid ? 8 : 7;
  const dark = shade(iris, 0.45), lite = shade(iris, 1.35);
  p.fill((x, y) => {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
    if (d > irisR + 0.6) {
      // sclera: warm white, soft shadow under the upper lid, a hint of veins at the edges
      const sh = clamp01((-dy - 6) / 26) * 0.18 + clamp01((d - 26) / 6) * 0.1;
      let col: RGB = mix([250, 246, 238], [214, 196, 196], sh);
      if (d > 24 && ((x * 7 + y * 13) % 23 === 0)) col = mix(col, [220, 120, 120], 0.35);
      return col;
    }
    if (d > irisR - 1.2) return dark;                       // the limbal ring
    if (d < pupR) return [12, 10, 12];
    const th = Math.atan2(dy, dx);
    const stri = 0.5 + 0.5 * Math.sin(th * 23 + Math.sin(th * 7) * 2);
    const t = (d - pupR) / (irisR - pupR);
    const base = mix(mix(dark, iris, clamp01(t * 1.6)), lite, clamp01(0.55 - t) * 0.7 * stri);
    return band(base, (0.85 + stri * 0.25) * (dy < -3 ? 0.88 : 1), x, y, 0.08);
  });
  // catchlights: a big one up-left, a small one down-right (they survive any lighting)
  p.ellipse(c - 6, c - 6, 3.6, 3.2, '#ffffff');
  p.set(c - 7, c - 7, '#ffffff');
  p.ellipse(c + 5, c + 5, 1.6, 1.6, '#f4f8ff');
  const tex = p.texture({ mip: true });
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.18, metalness: 0, emissive: new THREE.Color(0x222222), emissiveMap: tex, emissiveIntensity: 0.35 });
  eyeCache.set(key, m);
  return m;
}

/** a sphere with its pole on +z and planar front uvs (iris in the centre of the texture) */
function eyeballGeo(r: number): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, lp(8, 22), lp(6, 16));
  g.rotateX(Math.PI / 2);
  const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / r, y = pos.getY(i) / r, z = pos.getZ(i) / r;
    if (z > 0) uv.setXY(i, 0.5 + x * 0.5, 0.5 + y * 0.5); else uv.setXY(i, 0.5 + Math.sign(x || 1) * 0.49, 0.5);
  }
  return g;
}

// ------------------------------------------------------------------ mouth atlas
export function paintMouths(P: Px, L: Look) {
  const sk = L.skin;
  const lip: RGB = mix(mix(sk, [196, 92, 88], 0.42 * L.face.lipK + 0.08), [120, 60, 60], 0.12);
  const lipD = shade(lip, 0.72), lipL = shade(lip, 1.18);
  const line: RGB = mix(shade(sk, 0.25), [44, 14, 16], 0.6);
  const inside: RGB = [58, 20, 24], tongue: RGB = [208, 98, 104], tooth: RGB = [246, 240, 228], toothS: RGB = [200, 194, 186];
  const kidGap = L.face.teethGap;
  const [mx, my] = LAYOUT.MOUTH;
  MOUTHS.forEach((name, i) => {
    const ox = mx + (i % 4) * MOUTH_FW, oy = my + Math.floor(i / 4) * MOUTH_FH;
    const q = new Px(MOUTH_FW, MOUTH_FH);
    const cx = MOUTH_FW / 2, cy = MOUTH_FH / 2;
    const W = L.arch === 'kid' ? 11 : 13;
    // helpers: a curved mouth line y(x) = cy + curve * (x / w)^2, with lips around it
    const curveLine = (w: number, curve: number, thick = 1, cyy = cy) => {
      for (let x = -w; x <= w; x++) {
        const t = x / w, yy = cyy + curve * t * t - curve * 0.35;
        q.set(cx + x, Math.round(yy), line);
        if (thick > 1) q.set(cx + x, Math.round(yy) + 1, shade(line, 1.2));
      }
    };
    const lips = (w: number, curve: number, cyy = cy, full = 1) => {
      // upper lip: a thin band above the line with a cupid's bow; lower lip: fuller, lit, below
      for (let x = -w; x <= w; x++) {
        const t = x / w, yy = cyy + curve * t * t - curve * 0.35;
        const taper = 1 - t * t;
        const up = Math.round(1 + taper * 1.8 * full), lo = Math.round(1 + taper * 2.8 * full);
        for (let k = 1; k <= up; k++) q.set(cx + x, Math.round(yy) - k, k === up ? lipD : lip);
        for (let k = 1; k <= lo; k++) q.set(cx + x, Math.round(yy) + k, k === 1 ? lipD : k === lo ? shade(lip, 0.9) : (k === 2 && Math.abs(x) < w * 0.4 ? lipL : lip));
      }
      // cupid's bow dip
      q.set(cx, Math.round(cyy - curve * 0.35) - Math.round(1 + 1.4 * full), lip);
    };
    const openMouth = (w: number, h: number, upCurve: number, loCurve: number, teethTop: boolean, teethBot: boolean, tongueOn: boolean, cyy = cy) => {
      for (let x = -w; x <= w; x++) {
        const t = x / w, taper = Math.sqrt(Math.max(0, 1 - t * t));
        const yt = cyy - h * 0.5 * taper + upCurve * t * t, yb = cyy + h * 0.5 * taper + loCurve * t * t;
        for (let y = Math.ceil(yt); y <= Math.floor(yb); y++) {
          let c: RGB = inside;
          if (tongueOn && y > (yt + yb) / 2 + 1 && Math.abs(x) < w * 0.65) c = y > yb - 1.5 ? shade(tongue, 0.8) : tongue;
          if (teethTop && y < yt + Math.max(1.5, h * 0.24) && Math.abs(x) < w * 0.86) c = (Math.abs(x) % 3 === 0 && Math.abs(x) > 1) ? toothS : (kidGap && x >= -1 && x <= 0 ? inside : tooth);
          if (teethBot && y > yb - Math.max(1.5, h * 0.2) && Math.abs(x) < w * 0.75) c = (Math.abs(x) % 3 === 1) ? toothS : tooth;
          q.set(cx + x, y, c);
        }
        // lip rims round the opening
        q.set(cx + x, Math.floor(yt) , lipD); q.set(cx + x, Math.floor(yt) - 1, lip);
        if (Math.abs(t) < 0.85) q.set(cx + x, Math.floor(yt) - 2, lipD);
        q.set(cx + x, Math.ceil(yb), lipD); q.set(cx + x, Math.ceil(yb) + 1, Math.abs(t) < 0.5 ? lipL : lip);
        if (Math.abs(t) < 0.8) q.set(cx + x, Math.ceil(yb) + 2, lip);
        if (Math.abs(t) < 0.6) q.set(cx + x, Math.ceil(yb) + 3, lipD);
      }
    };
    switch (name) {
      case 'neutral': lips(W, 0.6); curveLine(W, 0.6); break;
      case 'smile': lips(W + 2, -3.2); curveLine(W + 2, -3.2); q.set(cx - W - 3, cy - 3, line); q.set(cx + W + 3, cy - 3, line); break;
      case 'grin': openMouth(W + 3, 6, -2.8, -1.2, true, false, false, cy - 1); break;
      case 'open': openMouth(W - 1, 6, 0.6, 0.3, true, false, true); break;
      case 'O': openMouth(4, 9, 0, 0, false, false, true); break;
      case 'frown': lips(W, 3.4, cy + 1); curveLine(W, 3.4, 1, cy + 1); break;
      case 'grit': {
        // teeth clenched and bared: a wide box of teeth with the gum line, lips pulled back
        const w = W + 3, h = 6;
        for (let x = -w; x <= w; x++) for (let y = -h / 2; y <= h / 2; y++) {
          const t = Math.abs(x) / w;
          if (Math.abs(y) > h / 2 - t * 1.5) continue;
          q.set(cx + x, cy + y, y === 0 ? toothS : (Math.abs(x) % 3 === 0 ? toothS : tooth));
        }
        for (let x = -w - 1; x <= w + 1; x++) { const t = Math.abs(x) / w; q.set(cx + x, cy - h / 2 - 1 + Math.round(t * 1.5), lipD); q.set(cx + x, cy + h / 2 + 1 - Math.round(t * 1.5), lipD); q.set(cx + x, cy + h / 2 + 2 - Math.round(t * 1.5), lip); }
        break;
      }
      case 'yell': openMouth(W + 1, 11, 1.5, 1.2, true, true, true); break;
      case 'smirk': {
        for (let x = -W; x <= W; x++) {
          const t = (x + W) / (2 * W), yy = cy + 0.5 - t * t * 3.5;
          q.set(cx + x, Math.round(yy), line);
          q.set(cx + x, Math.round(yy) + 1, lipD); q.set(cx + x, Math.round(yy) + 2, Math.abs(x) < 4 ? lipL : lip); q.set(cx + x, Math.round(yy) - 1, lip);
        }
        q.set(cx + W + 1, cy - 4, line);
        break;
      }
      case 'wavy': for (let x = -W; x <= W; x++) { const yy = cy + Math.sin(x * 0.75) * 1.2; q.set(cx + x, Math.round(yy), line); q.set(cx + x, Math.round(yy) + 1, lip); q.set(cx + x, Math.round(yy) + 2, lipD); q.set(cx + x, Math.round(yy) - 1, lip); } break;
      case 'tongue': lips(W, 0.4); curveLine(W, 0.4); q.ellipse(cx + 5, cy + 3, 3, 2.4, tongue); q.set(cx + 5, cy + 2, shade(tongue, 0.75)); q.set(cx + 4, cy + 4, shade(tongue, 1.15)); break;
      case 'flat': lips(W - 1, 0, cy, 0.7); curveLine(W - 1, 0); break;
      case 'pout': lips(5, 1.2, cy, 1.6); curveLine(5, 1.2); break;
      case 'gasp': openMouth(6, 9, 0.5, 1.5, true, false, false); break;
      case 'laugh': openMouth(W + 3, 10, -2.5, 0.8, true, false, true, cy - 1); break;
      case 'ooh': openMouth(3, 5, 0, 0, false, false, false); lips(4, 0, cy, 1.4); openMouth(3, 5, 0, 0, false, false, false); break;
    }
    P.draw(q, ox, oy);
  });
}

/** mark a face part for the face fill / flush (aFlush = 1) */
function faceMask(g: THREE.BufferGeometry, v = 1) { g.setAttribute('aFlush', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(v), 1)); return g; }

// ------------------------------------------------------------------ the face rig
export class FaceRig {
  group = new THREE.Group();
  private eyes: { pivot: THREE.Object3D; ball: THREE.Mesh; up: THREE.Mesh; lo: THREE.Mesh; side: number; hidden: boolean; yaw0: number }[] = [];
  private brows: { obj: THREE.Object3D; base: THREE.Vector3; side: number }[] = [];
  private mouthGeo: THREE.BufferGeometry | null = null;
  private mouthCols = 9; private mouthRows = 5;
  private cur: MouthFrame = 'neutral';
  private target: Expr = EXPRS.neutral;
  private s = { up: 34, lo: -40, tilt: 0, browY: 0, browT: 0, knit: 0, red: 0 };
  private blinkT = 2; private blinkK = 0;
  private sacc = new THREE.Vector2(); private saccT = 0;
  private talkT = 0;
  /** gaze target in head space (unit-ish direction, +z forward) */
  gaze = new THREE.Vector3(0, 0, 1);
  /** extra squint on top of the expression (lighting / tension) */
  strain = 0;
  name: ExprName = 'neutral';
  private dazed = 0;
  private hs: number;

  constructor(S: HeadShape, mat: THREE.Material, private onRed: (k: number) => void) {
    const L = S.L, F = S.F;
    this.hs = S.hs;
    const eR = F.eyeR;
    const em = eyeMaterial(L.face.iris, L.arch === 'kid');
    const ballGeo = eyeballGeo(eR * S.hs);
    const lidUp = faceMask(lidGeo(eR * 1.09 * S.hs, 1)), lidLo = faceMask(lidGeo(eR * 1.07 * S.hs, -1));
    for (const side of [1, -1]) {
      const hidden = (L.face.eyepatch === 'L' && side === 1) || (L.face.eyepatch === 'R' && side === -1);
      const a = side * F.eyeA;
      const n = S.normal(F.eyeY, a);
      const p0 = S.skull(F.eyeY, a, 0, false);
      const c: V3 = [p0[0] - n[0] * (0.0102 + eR * 0.28), p0[1] - n[1] * (0.0102 + eR * 0.28), p0[2] - n[2] * (0.0102 + eR * 0.28)];
      const pivot = new THREE.Object3D();
      const lc = S.loc(c);
      pivot.position.set(lc[0], lc[1], lc[2]);
      // the lids follow the skull's curve (a little yaw outward), the ball looks straight ahead
      pivot.rotation.set(0, side * F.eyeA * 0.35 * Math.PI / 180, 0);
      const ball = new THREE.Mesh(ballGeo, em);
      ball.rotation.y = -side * F.eyeA * 0.35 * Math.PI / 180;
      const up = new THREE.Mesh(lidUp, mat), lo = new THREE.Mesh(lidLo, mat);
      pivot.add(ball, up, lo);
      if (!hidden) this.group.add(pivot);
      for (const m of [ball, up, lo]) { m.castShadow = false; m.receiveShadow = true; }
      this.eyes.push({ pivot, ball, up, lo, side, hidden, yaw0: ball.rotation.y });
    }
    // brows: a flattened tapering tube along the brow ridge, its own pivot so it lifts / tilts / knits
    for (const side of [1, -1]) {
      const B = new Loft(false);
      const a0 = side * (F.eyeA - 13), a1 = side * (F.eyeA + 15);
      const n = 9;
      const thick = 0.0052 * L.face.brow * (L.arch === 'kid' ? 0.9 : 1);
      const mid = S.skull(F.browY, side * F.eyeA, 0, true);
      const midL = S.loc(mid);
      const path: V3[] = [];
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), a = a0 + (a1 - a0) * t;
        const arch = Math.sin(t * Math.PI * 0.9 + 0.15) * 0.005 - t * 0.002;
        const p = S.loc(S.skull(F.browY + arch, a, 0.0052, true));
        path.push([p[0] - midL[0], p[1] - midL[1], p[2] - midL[2]]);
      }
      B.tube(path, (t) => thick * S.hs * (1.15 - t * 0.7) * (t < 0.08 ? 0.75 : 1), 6, R('BROW'), 1, { capStart: true, capEnd: true });
      // squash the tube flat against the brow ridge
      const geo = B.build();
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const nn = S.normal(F.browY, side * F.eyeA);
      const nv = new THREE.Vector3(nn[0], nn[1], nn[2]);
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const d = v.dot(nv);
        v.addScaledVector(nv, -d * 0.55);
        // the brow's vertical thickness doubles: it reads from far away
        pos.setXYZ(i, v.x, v.y * 1.0, v.z);
      }
      geo.computeVertexNormals();
      faceMask(geo, 0.6);
      const obj = new THREE.Mesh(geo, mat);
      obj.position.set(midL[0], midL[1], midL[2]);
      this.group.add(obj);
      this.brows.push({ obj, base: obj.position.clone(), side });
    }
    // mouth decal hugging the muzzle
    {
      const cols = this.mouthCols, rows = this.mouthRows;
      const P: number[] = [], I: number[] = [];
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        const y = F.mouthY + 0.021 - (0.045 * i) / (rows - 1);
        const a = -40 + (80 * j) / (cols - 1);
        const p = S.loc(S.skull(y, a, 0.0011 + 0.0012 * Math.cos((a * Math.PI) / 180), true));
        P.push(p[0], p[1], p[2]);
      }
      for (let i = 0; i + 1 < rows; i++) for (let j = 0; j + 1 < cols; j++) {
        const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
        I.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(rows * cols * 2), 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(rows * cols * 3).fill(1), 3));
      g.setIndex(I);
      g.computeVertexNormals();
      faceMask(g);
      this.mouthGeo = g;
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.group.add(m);
      this.setMouth('neutral', true);
    }
  }

  private setMouth(f: MouthFrame, force = false) {
    if (!this.mouthGeo || (!force && f === this.cur)) return;
    this.cur = f;
    const reg = mouthReg(f);
    const uv = this.mouthGeo.attributes.uv as THREE.BufferAttribute;
    const cols = this.mouthCols, rows = this.mouthRows;
    // j = 0 is the wearer's right (screen left from the front), the painted frame's left edge
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) uv.setXY(i * cols + j, reg.x + (j / (cols - 1)) * reg.w, 1 - (reg.y + (i / (rows - 1)) * reg.h));
    uv.needsUpdate = true;
  }

  set(name: ExprName) { this.name = name; this.target = EXPRS[name] ?? EXPRS.neutral; }
  blink() { this.blinkT = 0; }
  setDazed(k: number) { this.dazed = k; }

  update(dt: number, time: number) {
    const T = this.target, s = this.s;
    const k = 1 - Math.exp(-dt * 14);
    s.up += (T.up - this.strain * 14 - s.up) * k;
    s.lo += (T.lo + this.strain * 10 - s.lo) * k;
    s.tilt += (T.tilt + this.strain * 0.15 - s.tilt) * k;
    s.browY += (T.browY - this.strain * 0.3 - s.browY) * k;
    s.browT += (T.browT + this.strain * 0.3 - s.browT) * k;
    s.knit += (T.knit + this.strain * 0.4 - s.knit) * k;
    s.red += (T.red + this.strain * 0.3 - s.red) * (1 - Math.exp(-dt * 3));
    this.onRed(s.red);
    // blinking: every 2-5 s, double blinks now and then
    this.blinkT -= dt;
    if (this.blinkT <= 0 && this.blinkK <= 0) { this.blinkK = 1; this.blinkT = 1.8 + Math.random() * 3.5; if (Math.random() < 0.15) this.blinkT = 0.3; }
    let bl = 0;
    if (this.blinkK > 0) { this.blinkK -= dt / 0.16; bl = Math.sin(clamp01(1 - this.blinkK) * Math.PI); }
    // saccades: tiny gaze jumps
    this.saccT -= dt;
    if (this.saccT <= 0) { this.saccT = 0.4 + Math.random() * 1.6; this.sacc.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.08); }
    // talking / yelling flaps the mouth between frames
    let mouth = T.mouth;
    if (T.talk) {
      this.talkT += dt * 9;
      const ph = Math.sin(this.talkT) + Math.sin(this.talkT * 1.7) * 0.5;
      mouth = ph > 0.2 ? T.mouth : ph > -0.6 ? 'open' : 'grit';
    }
    this.setMouth(mouth);
    const D = Math.PI / 180;
    const gx = THREE.MathUtils.clamp(Math.atan2(this.gaze.x, Math.max(0.2, this.gaze.z)) + this.sacc.x, -0.55, 0.55);
    const gy = THREE.MathUtils.clamp(Math.atan2(this.gaze.y, Math.max(0.2, this.gaze.z)) + this.sacc.y, -0.4, 0.4);
    for (const e of this.eyes) {
      if (e.hidden) continue;
      const cross = this.dazed > 0 ? Math.sin(time * 5 + e.side) * 0.3 * this.dazed : 0;
      e.ball.rotation.set(-gy + (this.dazed ? Math.cos(time * 4 + e.side * 2) * 0.25 * this.dazed : 0), e.yaw0 + gx + cross, 0, 'YXZ');
      // upper lid follows the gaze down a little (as real lids do)
      const up = Math.min(s.up + gy * 18, 70) * (1 - bl) + -10 * bl;
      const lo = s.lo * (1 - bl) + -14 * bl;
      const tilt = s.tilt * e.side;
      e.up.quaternion.setFromEuler(new THREE.Euler(-up * D, 0, tilt, 'ZXY'));
      e.lo.quaternion.setFromEuler(new THREE.Euler(-lo * D, 0, tilt * 0.4, 'ZXY'));
    }
    const hs = this.hs;
    for (const b of this.brows) {
      b.obj.position.copy(b.base);
      b.obj.position.y += s.browY * 0.011 * hs - s.knit * 0.002 * hs;
      b.obj.position.x -= b.side * s.knit * 0.004 * hs;
      // lowered / knitted brows ride out over the brow ridge instead of sinking into it
      b.obj.position.z += (Math.max(0, -s.browY) * 0.004 + s.knit * 0.002 + Math.abs(s.browT) * 0.002) * hs;
      b.obj.rotation.set(0, 0, b.side * (s.browT * 0.38), 'XYZ');
    }
  }
}

/** an eyelid: a hemispherical shell (front half) with an in-turned rim; side 1 upper (+y pole), -1 lower */
function lidGeo(r: number, side: number): THREE.BufferGeometry {
  const B = new Loft(false);
  const nA = 12, rings: { pts: V3[]; v: number }[] = [];
  const lat = [0.3, 0.6, 0.85, 1, 1.06];
  for (const l of lat) {
    const b = Math.min(1, l) * Math.PI / 2;
    const rr = l > 1 ? r * 0.92 : r;
    const pts: V3[] = [];
    for (let j = 0; j <= nA; j++) {
      const a = -0.18 + (Math.PI + 0.36) * (j / nA);
      const x = Math.cos(a) * Math.sin(b) * rr, z = Math.sin(a) * Math.sin(b) * rr, y = Math.cos(b) * rr * side;
      pts.push([x, y, z]);
    }
    // v = 1 at the rim (the painted lash line), 0 at the hinge pole
    rings.push({ pts, v: (l / 1.06) * 0.98 });
  }
  B.loft(rings, Array.from({ length: nA + 1 }, (_, j) => j / nA), R('LIDS'), 1, { start: [0, r * side, 0], startV: 0 });
  const g = B.build();
  return g;
}

export { skinPx };
