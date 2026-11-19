// 3D floating text, made of BUBBLES (v6). Every letter is a glassy bubble: the glyph of a chunky pixel font
// (Jersey 15) inflated into a closed, puffy balloon mesh (rounded corners, tube-round strokes, a flatter back), shaded
// as tinted glass -- a dark refractive edge so it reads on any background, a bright inner rim with a thin-film rainbow,
// a crisp specular glint (plus a small second one), a translucent body that lets the sea show through -- and the whole
// surface jiggles like jelly in the vertex shader. Words FORM from little bubbles that swirl in and coalesce into each
// letter (which then inflates with a wobbly overshoot), bob and breathe while they float, shed tiny bubbles that
// rise off them, and POP when they leave: a quick swell, a flash ring and a spray of droplets / mini-bubbles that
// drift up. The mini-bubbles are one instanced mesh per layer.
//
//   const t3d = new Text3DLayer(); scene.add(t3d.group);           in the LIT scene (not an overlay)
//   t3d.add('WAVE 3', x, y, 0.8, T3D.title, { size: 0.9, life: 3 })  a title that floats, bobs and pops out
//   t3d.damage(12, x, y, crit)                                       a rising damage number
//   const sign = t3d.add('SWIM', x, y, z, T3D.hint, { size: 0.45 }); sign.hide()
//   each frame: t3d.update(dt, camera)
//
//   new Float3D(t3d)   a FloatText that sends the big pops (titles, item names, crits, WAVE n) to 3D and keeps the
//                      small hints flat; hand it to a World as world.text.
//   bubbleWord('BLOBFISH', T3D.logo, 0.5)   a static bubble word (a Group, centred) for props such as the title sign
import * as THREE from 'three';
import { glyphs, measure, capH, type FontName } from './pixel/font';
import { FloatText, type StyleName } from './text';

export interface T3DStyle {
  font: FontName;
  /** glass tint: upper / lower part of the letters */
  top: string; bottom: string;
  /** the dark refractive edge of each bubble letter (readability) */
  edge: string;
  /** self-glow of the tint 0..1 (readability in deep water) */
  glow?: number;
  /** puffiness: how far the bubble swells out of the glyph (5 = normal) */
  depth?: number;
}

export const T3D = {
  title: { font: 'title', top: '#fff7d6', bottom: '#ffb43a', edge: '#4a1c08', glow: 0.35 },
  gold: { font: 'title', top: '#fffbe0', bottom: '#f0b030', edge: '#4a2a00', glow: 0.4 },
  danger: { font: 'title', top: '#ffe0e0', bottom: '#ff4a3a', edge: '#3a0006', glow: 0.35 },
  blood: { font: 'title', top: '#ff6a5a', bottom: '#b80e18', edge: '#1a0004', glow: 0.25, depth: 6 },
  hint: { font: 'small', top: '#f0fdff', bottom: '#8ae8ff', edge: '#06303f', glow: 0.45 },
  item: { font: 'title', top: '#ffffff', bottom: '#9fd6ff', edge: '#0c2a4a', glow: 0.45 },
  name: { font: 'title', top: '#fff2c8', bottom: '#ffd27a', edge: '#2a1408', glow: 0.35 },
  damage: { font: 'title', top: '#ffffff', bottom: '#ffd0c8', edge: '#5a0614', glow: 0.5 },
  crit: { font: 'title', top: '#fff6a0', bottom: '#ff8a1a', edge: '#4a0e00', glow: 0.6 },
  heal: { font: 'title', top: '#ffffff', bottom: '#5ae08a', edge: '#0b4a2a', glow: 0.5 },
  magic: { font: 'title', top: '#ffffff', bottom: '#c08cff', edge: '#2a0c4a', glow: 0.5 },
  logo: { font: 'title', top: '#fff6c8', bottom: '#ffb43a', edge: '#3a1400', glow: 0.3, depth: 6 },
  sub: { font: 'small', top: '#dff8ff', bottom: '#4ac8ff', edge: '#02203a', glow: 0.45 },
} satisfies Record<string, T3DStyle>;
export type T3DName = keyof typeof T3D;

/** the internal height the 3D scene renders at (src/gfx/post.ts lowResH) and the minimum cap height (render px) a
 *  word may shrink to there, per style font role ('small' words may be a little smaller) */
export const TEXT3D_VIEW = { lowResH: 440, minPx: 1.7, minCap: 19, minCapSmall: 13 };

/** the pixel face every bubble glyph is inflated from (chunky, round-friendly strokes) */
const FACE: Partial<Record<FontName, FontName>> = { big: 'hd20' };
const faceOf = (f: FontName): FontName => FACE[f] ?? (f.startsWith('hd') ? f : 'hd15');

// ------------------------------------------------------------------ shared time (jiggle, rainbow drift)
const U_TIME = { value: 0 };
const tick = () => { U_TIME.value = (performance.now() / 1000) % 3600; };

// ------------------------------------------------------------------ the inflated glyph
interface BubbleGlyph {
  geo: THREE.BufferGeometry | null;
  /** pen advance (font px) and the ink centre the geometry is centred on (x from the pen, y = cap / 2) */
  adv: number; cx: number;
  /** interior points (font px, geometry space), for the bubbles that gather into the letter and the pop spray */
  pts: Float32Array;
  /** ink half extents (font px) */
  hw: number; hh: number;
}
const glyphCache = new Map<string, BubbleGlyph>();

/** the glyph's ink as a hard mask (row 0 = cap top, the baseline at row `cap`) */
function inkMask(ch: string, face: FontName) {
  const g = glyphs(ch, { font: face, color: '#ffffff' });
  const d = g.cv.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, g.w, g.h).data;
  const m = new Uint8Array(g.w * g.h);
  for (let i = 0; i < g.w * g.h; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return { m, w: g.w, h: g.h };
}

/**
 * Inflate a glyph mask into a closed balloon. A field F = R - dist(p, ink) is sampled on a grid S times finer than the
 * font pixels (dilating the strokes by R and rounding every convex corner); marching squares cuts the outline with
 * smooth interpolated edges; every inside vertex gets its distance Di to that outline, and the surface rises on a
 * round (tube) profile h(Di) in front and a shallower one behind, both meeting at the outline. Attributes: aRim = Di
 * (the shader's edge / rim bands live in object space, so they stay crisp at any angle), aTone = 0 at the cap top
 * .. 1 at the baseline (the tint gradient).
 */
function inflate(mk: { m: Uint8Array; w: number; h: number }, cap: number, puff: number): { geo: THREE.BufferGeometry | null; cx: number; pts: Float32Array; hw: number; hh: number } {
  const { m, w, h } = mk;
  const S = 2, MG = 2, R = 0.5, RR = 1.55 * puff, HF = 1.45 * puff, HB = 0.7 * puff;
  const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] === 1;
  let ix0 = w, ix1 = -1, iy0 = h, iy1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { ix0 = Math.min(ix0, x); ix1 = Math.max(ix1, x); iy0 = Math.min(iy0, y); iy1 = Math.max(iy1, y); }
  if (ix1 < 0) return { geo: null, cx: w / 2, pts: new Float32Array(0), hw: 0, hh: 0 };
  const cx = (ix0 + ix1 + 1) / 2;
  const GW = (w + MG * 2) * S, GH = (h + MG * 2) * S;
  const NX = GW + 1;
  const F = new Float32Array((GW + 1) * (GH + 1));
  for (let j = 0; j <= GH; j++) for (let i = 0; i <= GW; i++) {
    const x = i / S - MG, y = j / S - MG;
    let best = 9;
    const px0 = Math.floor(x) - 2, py0 = Math.floor(y) - 2;
    for (let py = py0; py <= py0 + 4; py++) for (let px = px0; px <= px0 + 4; px++) {
      if (!ink(px, py)) continue;
      const dx = Math.max(px - x, 0, x - px - 1), dy = Math.max(py - y, 0, y - py - 1);
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
    F[j * NX + i] = R - best;
  }
  // vertices: grid corners (inside) and edge crossings (the outline)
  const vx: number[] = [], vy: number[] = [], vb: boolean[] = [];
  const idx = new Map<number, number>();
  const corner = (i: number, j: number) => {
    const key = j * NX + i;
    let v = idx.get(key);
    if (v === undefined) { v = vx.length; idx.set(key, v); vx.push(i / S - MG); vy.push(j / S - MG); vb.push(false); }
    return v;
  };
  const cross = (i0: number, j0: number, i1: number, j1: number) => {
    // edge key: horizontal edges first, then vertical ones
    const key = (j0 === j1 ? 0 : 1) * 1e7 + Math.min(j0, j1) * NX + Math.min(i0, i1) + 2e7;
    let v = idx.get(key);
    if (v === undefined) {
      const fa = F[j0 * NX + i0], fb = F[j1 * NX + i1];
      const t = fa / (fa - fb);
      v = vx.length; idx.set(key, v);
      vx.push((i0 + (i1 - i0) * t) / S - MG); vy.push((j0 + (j1 - j0) * t) / S - MG); vb.push(true);
    }
    return v;
  };
  const polys: number[][] = [];
  const segs: number[] = [];
  const C = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const inside = C.map(([a, b]) => F[(j + b) * NX + i + a] > 0);
    if (!inside[0] && !inside[1] && !inside[2] && !inside[3]) continue;
    const poly: number[] = [];
    for (let e = 0; e < 4; e++) {
      const a = C[e], b = C[(e + 1) % 4];
      if (inside[e]) poly.push(corner(i + a[0], j + a[1]));
      if (inside[e] !== inside[(e + 1) % 4]) poly.push(cross(i + a[0], j + a[1], i + b[0], j + b[1]));
    }
    for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; if (vb[p] && vb[q] && p !== q) segs.push(p, q); }
    polys.push(poly);
  }
  // distance to the outline for every inside vertex
  const n = vx.length;
  const di = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    if (vb[v]) continue;
    let best = 9;
    for (let s = 0; s < segs.length; s += 2) {
      const a = segs[s], b = segs[s + 1];
      const ax = vx[a], ay = vy[a], bx = vx[b] - ax, by = vy[b] - ay;
      const l2 = bx * bx + by * by || 1e-9;
      const t = Math.max(0, Math.min(1, ((vx[v] - ax) * bx + (vy[v] - ay) * by) / l2));
      const d = Math.hypot(vx[v] - ax - bx * t, vy[v] - ay - by * t);
      if (d < best) best = d;
    }
    di[v] = best;
  }
  const prof = (d: number) => { const k = Math.min(1, d / RR); return Math.sqrt(Math.max(0, 1 - (1 - k) * (1 - k))); };
  // front vertices 0..n-1; back vertices for the inside ones only (the outline is shared: a closed balloon)
  const back = new Int32Array(n).fill(-1);
  let nb = n;
  for (let v = 0; v < n; v++) if (!vb[v]) back[v] = nb++;
  const P = new Float32Array(nb * 3), RIM = new Float32Array(nb), TONE = new Float32Array(nb);
  for (let v = 0; v < n; v++) {
    const X = vx[v] - cx, Y = cap / 2 - vy[v], hz = prof(di[v]);
    const tone = Math.max(0, Math.min(1, vy[v] / Math.max(1, cap)));
    P[v * 3] = X; P[v * 3 + 1] = Y; P[v * 3 + 2] = hz * HF; RIM[v] = di[v]; TONE[v] = tone;
    if (back[v] >= 0) { const b = back[v]; P[b * 3] = X; P[b * 3 + 1] = Y; P[b * 3 + 2] = -hz * HB; RIM[b] = di[v]; TONE[b] = tone; }
  }
  const I: number[] = [];
  for (const poly of polys) {
    for (let k = 1; k < poly.length - 1; k++) {
      let a = poly[0], b = poly[k], c = poly[k + 1];
      // (font rows run down, the mesh's y up: keep every front face counter-clockwise seen from +z)
      const cr = (vx[b] - vx[a]) * (-(vy[c] - vy[a])) - (-(vy[b] - vy[a])) * (vx[c] - vx[a]);
      if (Math.abs(cr) < 1e-9) continue;
      if (cr < 0) { const t = b; b = c; c = t; }
      I.push(a, b, c);
      const ba = back[a] >= 0 ? back[a] : a, bb = back[b] >= 0 ? back[b] : b, bc = back[c] >= 0 ? back[c] : c;
      I.push(ba, bc, bb);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('aRim', new THREE.BufferAttribute(RIM, 1));
  geo.setAttribute('aTone', new THREE.BufferAttribute(TONE, 1));
  geo.setIndex(I);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // interior sample points for the gathering / popping bubbles (a fixed scatter, deep inside the strokes)
  const inner: number[] = [];
  for (let v = 0; v < n; v++) if (!vb[v] && di[v] > 0.45) inner.push(v);
  const pts: number[] = [];
  const want = Math.min(28, inner.length);
  for (let k = 0; k < want; k++) {
    const v = inner[Math.floor(((k * 0.618034) % 1) * inner.length)];
    pts.push(vx[v] - cx, cap / 2 - vy[v], prof(di[v]) * HF * 0.4);
  }
  return { geo, cx, pts: new Float32Array(pts), hw: (ix1 - ix0 + 1) / 2 + R, hh: (iy1 - iy0 + 1) / 2 + R };
}

function bubbleGlyph(ch: string, st: T3DStyle): BubbleGlyph {
  const face = faceOf(st.font);
  const puff = (st.depth ?? 5) / 5;
  const key = ch + '\u0000' + face + '|' + puff;
  let g = glyphCache.get(key);
  if (!g) {
    const adv = measure(ch, face);
    if (!ch.trim()) g = { geo: null, adv, cx: 0, pts: new Float32Array(0), hw: 0, hh: 0 };
    else { const r = inflate(inkMask(ch, face), capH(face), puff); g = { geo: r.geo, adv, cx: r.cx, pts: r.pts, hw: r.hw, hh: r.hh }; }
    glyphCache.set(key, g);
  }
  return g;
}

// ------------------------------------------------------------------ the glass
const GLASS_VS = /* glsl */ `
attribute float aRim;
attribute float aTone;
uniform float uTime;
uniform float uJiggle;
varying vec3 vN;
varying vec3 vV;
varying float vRim;
varying float vTone;
varying float vFront;
void main() {
  vec3 p = position;
  // per-letter phase from where the letter is (no per-mesh uniforms needed)
  float ph = dot(modelMatrix[3].xyz, vec3(3.1, 2.3, 1.7));
  // jelly: two slow travelling ripples along the normal, strongest in the soft middle of the strokes
  float soft = clamp(aRim * 0.9, 0.0, 1.0);
  float wob = sin(p.y * 0.62 + uTime * 5.3 + ph) * 0.6 + sin(p.x * 0.8 - uTime * 3.9 + ph * 1.7) * 0.4;
  p += normal * wob * uJiggle * (0.35 + soft * 0.65);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = -mv.xyz;
  vRim = aRim;
  vTone = aTone;
  vFront = step(0.0, position.z);
  gl_Position = projectionMatrix * mv;
}`;

const GLASS_FS = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBot;
uniform vec3 uEdge;
uniform float uGlow;
uniform float uTime;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vV;
varying float vRim;
varying float vTone;
varying float vFront;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 1.8);
  // the tint: top -> bottom, lit from the upper left, a little self-glow for deep water
  float tone = smoothstep(0.25, 0.75, vTone);
  vec3 base = mix(uTop, uBot, tone);
  vec3 L = normalize(vec3(-0.45, 0.8, 0.55));
  float lam = clamp(dot(N, L) * 0.55 + 0.5, 0.0, 1.0);
  vec3 col = base * (0.55 + 0.6 * lam) + base * uGlow;
  // the skin (the last font pixel before the edge): denser colour with a thin-film rainbow drifting round it
  float skin = 1.0 - smoothstep(0.35, 1.15, vRim);
  vec3 irid = 0.6 + 0.4 * cos(6.2832 * (vRim * 0.6 + fr + vTone * 0.5 + uTime * 0.15 + vec3(0.0, 0.33, 0.67)));
  col = mix(col, col * irid * 1.25, skin * 0.5);
  // the lit inner rim: a white stroke along the upper-left inside edge of every letter, a fainter one opposite
  float nl = length(N.xy);
  vec2 nd = N.xy / max(0.001, nl);
  float side = dot(nd, normalize(vec2(-0.55, 0.85)));
  float band = smoothstep(0.36, 0.52, vRim) * (1.0 - smoothstep(0.75, 1.05, vRim)) * smoothstep(0.05, 0.25, nl);
  float hi = band * smoothstep(0.05, 0.55, side);
  col = mix(col, vec3(1.0), hi * 0.85);
  col += irid * band * smoothstep(0.2, 0.7, -side) * 0.3;
  // specular glints: a big soft-edged one up-left, a small one down-right
  vec3 R = reflect(-V, N);
  float g1 = smoothstep(0.86, 0.92, max(dot(R, L), 0.0)) * (1.0 - tone * 0.5);
  float g2 = smoothstep(0.95, 0.975, max(dot(R, normalize(vec3(0.55, -0.45, 0.7))), 0.0)) * 0.7;
  float glint = max(g1, g2) * vFront;
  col += vec3(1.0, 0.98, 0.92) * glint * 2.2 + vec3(0.8, 0.92, 1.0) * fr * 0.3;
  // the dark refractive edge round every letter (object space, so it stays crisp): reads over bright sand
  float edge = 1.0 - smoothstep(0.28, 0.5, vRim);
  col = mix(col, uEdge, edge * 0.9);
  // a hollow bubble: see-through in the middle, dense at the skin
  float a = mix(0.42, 0.95, max(max(skin * 0.85, fr), hi));
  a = max(max(a, edge * 0.95), glint);
  gl_FragColor = vec4(col, a * uOpacity);
}`;

const matCache = new Map<string, THREE.ShaderMaterial>();
function styleKey(st: T3DStyle) { return [st.font, st.top, st.bottom, st.edge, st.glow ?? 0.3].join('|'); }
/** the bubble-glass material of a style (shared by every letter in it) */
function glassMat(st: T3DStyle): THREE.ShaderMaterial {
  const key = styleKey(st);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      vertexShader: GLASS_VS, fragmentShader: GLASS_FS, transparent: true, depthWrite: true,
      uniforms: {
        uTime: U_TIME, uJiggle: { value: 0.22 },
        uTop: { value: new THREE.Color(st.top) }, uBot: { value: new THREE.Color(st.bottom) }, uEdge: { value: new THREE.Color(st.edge) },
        uGlow: { value: st.glow ?? 0.3 }, uOpacity: { value: 1 },
      },
    });
    matCache.set(key, m);
  }
  return m;
}

// ------------------------------------------------------------------ mini-bubbles (gather, trail, pop spray)
const MINI_VS = /* glsl */ `
attribute float aFade;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying vec3 vCol;
varying float vFade;
void main() {
  vec3 p = position;
  float ph = dot(instanceMatrix[3].xyz, vec3(5.1, 3.7, 2.3));
  p *= 1.0 + 0.12 * sin(uTime * 9.0 + ph + p.y * 2.0);
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * mat3(instanceMatrix) * normal);
  vV = -mv.xyz;
#ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
#else
  vCol = vec3(0.8, 0.95, 1.0);
#endif
  vFade = aFade;
  gl_Position = projectionMatrix * mv;
}`;
const MINI_FS = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vCol;
varying float vFade;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 1.6);
  vec3 L = normalize(vec3(-0.45, 0.8, 0.55));
  float s = max(dot(reflect(-V, N), L), 0.0);
  // (a negative fade marks the pop ring: a bare skin, no glint)
  float ring = step(vFade, 0.0);
  float glint = smoothstep(0.86, 0.93, s) * (1.0 - ring);
  vec3 col = mix(vCol * 0.9, vec3(0.95, 1.0, 1.0), fr * 0.7) + glint * 1.6;
  float a = clamp(mix(0.18, 0.0, ring) + fr * mix(0.85, 0.7, ring) + glint, 0.0, 1.0);
  gl_FragColor = vec4(col, a * abs(vFade));
}`;

let miniMat: THREE.ShaderMaterial | null = null;
/** the glass of the mini-bubbles (instanced; per-instance colour and an aFade attribute) */
function miniMaterial() {
  return (miniMat ??= new THREE.ShaderMaterial({ vertexShader: MINI_VS, fragmentShader: MINI_FS, transparent: true, depthWrite: false, uniforms: { uTime: U_TIME } }));
}

/**
 * `n` glassy bubbles as one instanced mesh, in the same glass as the text's mini-bubbles (rim, glint, wobble): place
 * each with setMatrixAt (a scale = its radius) and tint it with setColorAt. Props use it (the tutorial's bubble rings).
 */
export function bubbleCluster(n: number, tint = '#cfefff'): THREE.InstancedMesh {
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1));
  const m = new THREE.InstancedMesh(g, miniMaterial(), n);
  const c = new THREE.Color(tint);
  for (let i = 0; i < n; i++) m.setColorAt(i, c);
  m.frustumCulled = false;
  m.renderOrder = 2;
  m.onBeforeRender = tick;
  return m;
}

const MAXB = 1024;
interface Mini {
  on: boolean;
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  r: number; r1: number; t: number; life: number;
  /** 'gather': flies from (x0,y0,z0) to the target (tx,ty,tz) and is absorbed; 'free': buoyant drift; 'flash': the pop ring */
  mode: 'gather' | 'free' | 'flash';
  x0: number; y0: number; z0: number; tx: number; ty: number; tz: number; swirl: number;
  col: THREE.Color;
}

class MiniBubbles {
  mesh: THREE.InstancedMesh;
  private p: Mini[] = [];
  private fade: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private next = 0;
  constructor() {
    const g = new THREE.IcosahedronGeometry(1, 1);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(MAXB), 1);
    this.fade.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aFade', this.fade);
    this.mesh = new THREE.InstancedMesh(g, miniMaterial(), MAXB);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color('#ffffff'));
    this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 2;
    for (let i = 0; i < MAXB; i++) this.p.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, r1: 0, t: 0, life: 1, mode: 'free', x0: 0, y0: 0, z0: 0, tx: 0, ty: 0, tz: 0, swirl: 0, col: new THREE.Color() });
  }
  private alloc(): Mini {
    for (let k = 0; k < MAXB; k++) { const i = (this.next + k) % MAXB; if (!this.p[i].on) { this.next = i + 1; return this.p[i]; } }
    const i = this.next % MAXB; this.next = i + 1; return this.p[i];
  }
  /** a bubble that rides from `from` into `to` over `life` s (absorbed on arrival) */
  gather(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number, r: number, life: number, col: THREE.Color) {
    const b = this.alloc();
    Object.assign(b, { on: true, mode: 'gather', x: fx, y: fy, z: fz, x0: fx, y0: fy, z0: fz, tx, ty, tz, r, r1: r * 0.55, t: 0, life, swirl: (Math.random() - 0.5) * 2.2, vx: 0, vy: 0, vz: 0 });
    this.tint(b, col);
  }
  /** a free bubble: buoyant, damped, wobbling, shrinking away at the end */
  free(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, life: number, col: THREE.Color) {
    const b = this.alloc();
    Object.assign(b, { on: true, mode: 'free', x, y, z, vx, vy, vz, r, r1: r, t: 0, life, swirl: Math.random() * 6.28 });
    this.tint(b, col);
  }
  /** the pop ring: a thin bubble skin that swells and vanishes */
  flash(x: number, y: number, z: number, r0: number, r1: number, col: THREE.Color) {
    const b = this.alloc();
    Object.assign(b, { on: true, mode: 'flash', x, y, z, vx: 0, vy: 0, vz: 0, r: r0, r1, t: 0, life: 0.14, swirl: 0 });
    this.tint(b, col);
  }
  private tint(b: Mini, col: THREE.Color) { b.col.copy(col); }
  clear() { for (const b of this.p) b.on = false; this.mesh.count = 0; }
  get live() { let n = 0; for (const b of this.p) if (b.on) n++; return n; }
  update(dt: number) {
    let n = 0;
    for (const b of this.p) {
      if (!b.on) continue;
      b.t += dt;
      const k = Math.min(1, b.t / b.life);
      let r = b.r, fade = 1;
      if (b.mode === 'gather') {
        // ease in along a slight curve (swirl), shrinking as it merges
        const e = k * k * (3 - 2 * k), e2 = e * e;
        const dx = b.tx - b.x0, dy = b.ty - b.y0;
        const sw = Math.sin(k * Math.PI) * b.swirl;
        b.x = b.x0 + dx * e2 - dy * sw * 0.25; b.y = b.y0 + dy * e2 + dx * sw * 0.25; b.z = b.z0 + (b.tz - b.z0) * e2;
        r = b.r + (b.r1 - b.r) * e;
        if (k >= 1) { b.on = false; continue; }
      } else if (b.mode === 'flash') {
        r = b.r + (b.r1 - b.r) * (1 - (1 - k) * (1 - k));
        fade = -(1 - k) * 0.75;
        if (k >= 1) { b.on = false; continue; }
      } else {
        b.vy += 1.4 * b.r * 10 * dt;
        const dr = Math.exp(-dt * 3.2);
        b.vx *= dr; b.vy *= Math.exp(-dt * 1.4); b.vz *= dr;
        b.x += (b.vx + Math.sin(b.t * 7 + b.swirl) * 0.12) * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        r = b.r * (k > 0.75 ? 1 - (k - 0.75) * 4 * 0.8 : 1);
        if (k >= 1) { b.on = false; continue; }
      }
      this.m.compose(this.v.set(b.x, b.y, b.z), this.q, this.s.setScalar(Math.max(1e-4, r)));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, b.col);
      this.fade.setX(n, fade);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.fade.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ a word in the world
export interface T3DOpts {
  /** cap height in metres (default 0.6) */
  size?: number;
  /** seconds until it pops out on its own (0 = stays until hide()) */
  life?: number;
  /** bob amplitude (in letter heights) and the wave phase between letters */
  bob?: number; wave?: number;
  /** seconds between letters forming */
  stagger?: number;
  /** delay before the first letter */
  delay?: number;
  /** rise speed (m/s, damped) */
  rise?: number;
  /** how much the word turns to face the camera (0..1) and the slight angle it keeps (radians of yaw) */
  face?: number; angle?: number;
  /** 0..1: pitch up to face a camera that looks down on it (top-down rooms); unset = the default slight lean */
  tilt?: number;
  /** follow a moving point (x, y, z added to the position) */
  follow?: () => { x: number; y: number; z?: number };
  /** shake the letters (crits, BREAD!!) */
  shake?: number;
  /** kept for compatibility (bubbles cast no hard shadow) */
  shadow?: boolean;
  /** entrance: 'pop' (little bubbles swirl in and coalesce), 'drop' (they rise in from below, the letter lands with a
   *  wobbly bounce), 'slam' (big and heavy: it inflates at once and sprays bubbles) */
  enter?: 'pop' | 'drop' | 'slam';
  /** called when a letter has formed (slam thuds, ticks) */
  onLand?: (i: number) => void;
}

interface Letter {
  mesh: THREE.Mesh; i: number; g: BubbleGlyph;
  /** scale spring (1 = rest), its velocity; the flip-in turn and its velocity */
  sy: number; vy: number; ry: number; vry: number;
  landed: boolean; gathered: boolean; popped: boolean;
  base: number; x: number;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Text3D {
  group = new THREE.Group();
  private inner = new THREE.Group();
  letters: Letter[] = [];
  t = 0;
  outT = -1;
  dead = false;
  pos = new THREE.Vector3();
  /** where the mini-bubbles go (set by the layer) */
  fx: MiniBubbles | null = null;
  private o: Required<Omit<T3DOpts, 'follow' | 'onLand' | 'tilt'>> & Pick<T3DOpts, 'follow' | 'onLand' | 'tilt'>;
  private yaw = 0;
  private vox: number;
  private riseV: number;
  private trailT = 0.6;
  private tint: THREE.Color;
  private small: boolean;
  /** quick words (damage numbers): a short gather, a small spray */
  private quick: boolean;
  readonly width: number;
  readonly text: string;

  constructor(text: string, st: T3DStyle, x: number, y: number, z: number, o: T3DOpts = {}) {
    this.text = text;
    this.o = {
      size: o.size ?? 0.6, life: o.life ?? 0, bob: o.bob ?? 0.06, wave: o.wave ?? 0.55, stagger: o.stagger ?? 0.045, delay: o.delay ?? 0,
      rise: o.rise ?? 0, face: o.face ?? 0.85, angle: o.angle ?? ((o.size ?? 0.6) < 0.45 ? 0.08 : 0.22), shake: o.shake ?? 0, shadow: o.shadow ?? true, enter: o.enter ?? 'pop',
      follow: o.follow, onLand: o.onLand, tilt: o.tilt,
    };
    this.riseV = this.o.rise;
    this.pos.set(x, y, z);
    this.small = st.font === 'small' || st.font === 'tiny';
    this.quick = this.o.stagger <= 0.025 && this.o.life > 0 && this.o.life <= 1.4;
    this.tint = new THREE.Color(st.top).lerp(new THREE.Color(st.bottom), 0.35);
    const face = faceOf(st.font);
    const cap = capH(face);
    this.vox = this.o.size / Math.max(5, cap);
    const mat = glassMat(st);
    const lines = text.split('\n');
    const lh = cap * 1.45;
    let idx = 0, maxW = 0;
    lines.forEach((line, li) => {
      const lw = measure(line, face);
      maxW = Math.max(maxW, lw);
      let pen = 0;
      for (const ch of line) {
        const g = bubbleGlyph(ch, st);
        const x0 = pen;
        pen += g.adv;
        if (!g.geo) continue;
        const mesh = new THREE.Mesh(g.geo, mat);
        mesh.castShadow = false; mesh.receiveShadow = false;
        const lx = (x0 + g.cx - lw / 2) * this.vox, ly = ((lines.length - 1 - li) * lh + cap / 2) * this.vox;
        mesh.position.set(lx, ly, 0);
        mesh.scale.setScalar(1e-4);
        mesh.visible = false;
        this.inner.add(mesh);
        this.letters.push({ mesh, i: idx++, g, sy: 0, vy: 0, ry: 0, vry: 0, landed: false, gathered: false, popped: false, base: ly, x: lx });
      }
    });
    this.width = maxW * this.vox;
    // centre the block vertically on the anchor
    this.inner.position.y = -((lines.length - 1) * lh * this.vox) / 2 - this.o.size / 2;
    this.group.add(this.inner);
    this.group.position.copy(this.pos);
  }

  get alive() { return !this.dead; }
  get out() { return this.outT >= 0; }
  /** pop out now (or after `after` seconds) */
  hide(after = 0) { if (this.outT < 0) this.outT = this.t + after; }
  /** retime its life */
  setLife(sec: number) { this.o.life = this.t + sec; }

  /** a point of the letter (glyph px, geometry space) in the layer's space, at the letter's REST pose */
  private restPoint(L: Letter, px: number, py: number, pz: number, out: THREE.Vector3) {
    out.set(L.x + px * this.vox, L.base + py * this.vox, pz * this.vox);
    this.inner.localToWorld(out);
    return this.fx ? this.fx.mesh.parent!.worldToLocal(out) : out;
  }

  /** the little bubbles that swirl in and coalesce into a letter */
  private gatherInto(L: Letter, dur: number) {
    const fx = this.fx;
    if (!fx || !fx.mesh.parent) return;
    const g = L.g, np = g.pts.length / 3;
    if (!np) return;
    const n = this.quick ? 3 : Math.max(5, Math.min(11, Math.round(np * 0.45)));
    const s = this.o.size * (this.group.scale.x || 1);
    for (let k = 0; k < n; k++) {
      const j = (k * 7 + L.i * 3) % np;
      this.restPoint(L, g.pts[j * 3], g.pts[j * 3 + 1], g.pts[j * 3 + 2], _v);
      const a = Math.random() * Math.PI * 2;
      const rr = (this.quick ? 0.35 : 0.7 + Math.random() * 0.7) * s;
      const below = this.o.enter === 'drop' ? -1.1 * s : -0.25 * s;
      fx.gather(_v.x + Math.cos(a) * rr, _v.y + Math.sin(a) * rr * 0.8 + below, _v.z + (Math.random() - 0.5) * 0.4 * s, _v.x, _v.y, _v.z,
        s * (0.07 + Math.random() * 0.07), dur * (0.75 + Math.random() * 0.25), this.tint);
    }
  }

  /** the pop: a flash ring and a spray of droplets / mini-bubbles from inside the letter */
  private popOut(L: Letter) {
    const fx = this.fx;
    if (!fx || !fx.mesh.parent) return;
    const g = L.g, np = g.pts.length / 3;
    const s = this.o.size * (this.group.scale.x || 1);
    this.restPoint(L, 0, 0, 0, _w);
    fx.flash(_w.x, _w.y, _w.z, s * 0.2, s * (this.quick ? 0.45 : 0.6), this.tint);
    const n = this.quick ? 4 : Math.max(6, Math.min(12, Math.round(np * 0.5)));
    for (let k = 0; k < n && np; k++) {
      const j = (k * 5 + L.i) % np;
      this.restPoint(L, g.pts[j * 3], g.pts[j * 3 + 1], g.pts[j * 3 + 2], _v);
      const dx = _v.x - _w.x, dy = _v.y - _w.y, d = Math.hypot(dx, dy) || 1;
      const sp = (1.4 + Math.random() * 1.6) * s;
      fx.free(_v.x, _v.y, _v.z, (dx / d) * sp, (dy / d) * sp + 0.6 * s, (Math.random() - 0.3) * sp * 0.5,
        s * (0.04 + Math.random() * (k < 3 ? 0.09 : 0.05)), 0.55 + Math.random() * 0.6, this.tint);
    }
  }

  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const o = this.o;
    if (o.life > 0 && this.t >= o.life && this.outT < 0) this.outT = this.t;
    if (this.riseV) { this.pos.y += this.riseV * dt; this.riseV *= Math.exp(-dt * 2.2); }
    const f = o.follow?.();
    const gx = this.pos.x + (f?.x ?? 0), gy = this.pos.y + (f?.y ?? 0), gz = this.pos.z + (f?.z ?? 0);
    this.group.position.set(gx, gy, gz);
    // turn toward the camera, keeping a slight angle so the puffy depth shows
    const cp = cam.position;
    const want = Math.atan2(cp.x - gx, cp.z - gz) * o.face + o.angle;
    this.yaw += (want - this.yaw) * (1 - Math.exp(-dt * 6));
    // (by default it leans back a touch so the puffy tops show; `tilt` turns it up to face a camera above instead)
    const elev = Math.atan2(cp.y - gy, Math.hypot(cp.x - gx, cp.z - gz));
    const rx = o.tilt !== undefined ? -elev * o.tilt : elev * 0.175 * o.face;
    this.group.rotation.set(rx, this.yaw, Math.sin(this.t * 0.9) * 0.02, 'YXZ');
    // legibility floor: the world renders at ~TEXT3D_VIEW.lowResH px tall, so a word's cap must cover at least
    // minCap of those or it mushes into the scenery; small words grow (up to 2x) until it does
    const pc = cam as THREE.PerspectiveCamera;
    if (pc.isPerspectiveCamera) {
      const dist = Math.max(0.1, Math.hypot(cp.x - gx, cp.y - gy, cp.z - gz));
      const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / TEXT3D_VIEW.lowResH;
      const need = ((this.small ? TEXT3D_VIEW.minCapSmall : TEXT3D_VIEW.minCap) * worldPerPx) / o.size;
      this.group.scale.setScalar(Math.min(2, Math.max(1, need)));
    }
    this.group.updateMatrixWorld();
    // how long the bubbles take to gather, then the letter inflates
    const G = this.quick ? 0.07 : o.enter === 'slam' ? 0 : o.enter === 'drop' ? 0.34 : 0.26;
    let allGone = this.outT >= 0;
    const n = this.letters.length;
    let anyShown = false;
    for (const L of this.letters) {
      const m = L.mesh;
      const li = this.t - o.delay - L.i * o.stagger;
      if (li < 0 || L.popped) { m.visible = false; if (!L.popped) allGone = false; continue; }
      if (!L.gathered) {
        L.gathered = true;
        if (G > 0) this.gatherInto(L, G);
      }
      let sy: number, drop = 0, sw = 1;
      const outK = this.outT >= 0 ? this.t - this.outT - (n - 1 - L.i) * o.stagger * 0.5 : -1;
      if (outK > 0) {
        // out: a quick swell (the skin stretching), then POP into droplets (a letter that never formed just goes)
        if (!L.landed) { L.popped = true; m.visible = false; continue; }
        const k = Math.min(1, outK / 0.11);
        sy = Math.max(0.05, L.sy);
        sw = 1 + Math.sin(k * Math.PI * 0.5) * 0.18;
        if (k >= 1) { L.popped = true; if (L.sy > 0.2) this.popOut(L); m.visible = false; continue; }
        allGone = false;
      } else {
        allGone = false;
        if (li < G) { m.visible = false; continue; }
        if (!L.landed) {
          // formed: start the inflate spring (a jelly overshoot) and a flip-in turn
          L.landed = true;
          L.sy = o.enter === 'slam' ? 1.7 : 0.2; L.vy = o.enter === 'slam' ? 0 : o.enter === 'drop' ? 6.5 : 9;
          L.ry = o.enter === 'slam' ? 0 : (L.i % 2 ? -1 : 1) * 0.7; L.vry = 0;
          o.onLand?.(L.i);
          if (o.enter === 'slam' && this.fx) for (let k = 0; k < 3; k++) this.popSpray(L, 0.6);
        }
        const kk = o.enter === 'slam' ? 240 : 150, c = o.enter === 'slam' ? 10 : 7.5;
        L.vy += (-(L.sy - 1) * kk - L.vy * c) * dt;
        L.sy += L.vy * dt;
        L.vry += (-L.ry * 120 - L.vry * 8) * dt; L.ry += L.vry * dt;
        sy = Math.max(0.05, L.sy);
        if (o.enter === 'drop') { const lk = li - G; drop = lk < 0.4 ? -Math.cos(Math.min(1, lk / 0.4) * Math.PI * 0.5) * (1 - lk / 0.4) * 0.9 : 0; }
        if (o.enter === 'slam') drop = Math.max(0, 1 - (li - G) / 0.1) * 1.6;
        // breathing: a slow, soft swell (bubbles are never quite still)
        sw = 1 + Math.sin(this.t * 2.6 + L.i * 1.3) * 0.025;
      }
      m.visible = true;
      anyShown = true;
      // squash & stretch that keeps the volume (stretched tall = thinner)
      const sx = (1 / Math.sqrt(Math.max(0.3, sy))) * Math.min(1, sy * 2.5);
      const bob = Math.sin(this.t * 2.2 - L.i * o.wave) * o.bob * o.size;
      const sh = o.shake ? (Math.random() - 0.5) * o.shake * o.size * 0.12 : 0;
      m.scale.set(this.vox * sx * sw, this.vox * sy * sw, this.vox * sx * sw);
      m.position.y = L.base + bob + drop * o.size + sh;
      m.position.x = L.x + (o.shake ? (Math.random() - 0.5) * o.shake * o.size * 0.08 : 0);
      m.rotation.z = Math.sin(this.t * 1.7 - L.i * 0.8) * 0.06 + (o.shake ? (Math.random() - 0.5) * o.shake * 0.08 : 0);
      m.rotation.y = outK > 0 ? 0 : L.ry;
    }
    // a trail of tiny bubbles rising off the word (busier while it rises)
    if (anyShown && this.fx && this.outT < 0) {
      this.trailT -= dt * (this.riseV > 0.2 ? 6 : this.quick ? 0 : 1);
      if (this.trailT <= 0 && n) {
        this.trailT = 0.35 + Math.random() * 0.9;
        const L = this.letters[Math.floor(Math.random() * n)];
        if (L.mesh.visible && L.g.pts.length) {
          const s = this.o.size * (this.group.scale.x || 1);
          this.restPoint(L, (Math.random() - 0.5) * L.g.hw, L.g.hh * (this.riseV > 0.2 ? -0.8 : 0.8), 0.5, _v);
          this.fx.free(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.2 * s, 0.4 * s, 0, s * (0.035 + Math.random() * 0.04), 1 + Math.random() * 0.8, this.tint);
        }
      }
    }
    if (allGone && this.outT >= 0) { this.dead = true; this.group.visible = false; }
  }

  /** a few bubbles burst out of a letter (slam entrances) */
  private popSpray(L: Letter, k: number) {
    const fx = this.fx, g = L.g, np = g.pts.length / 3;
    if (!fx || !np) return;
    const s = this.o.size * (this.group.scale.x || 1);
    this.restPoint(L, 0, 0, 0, _w);
    for (let j = 0; j < 3; j++) {
      const p = Math.floor(Math.random() * np);
      this.restPoint(L, g.pts[p * 3], g.pts[p * 3 + 1], g.pts[p * 3 + 2], _v);
      const dx = _v.x - _w.x + (Math.random() - 0.5) * 0.1, dy = _v.y - _w.y + (Math.random() - 0.5) * 0.1, d = Math.hypot(dx, dy) || 1;
      fx.free(_v.x, _v.y, _v.z, (dx / d) * 2.6 * s * k, (dy / d) * 2.6 * s * k, 0.4 * s, s * (0.04 + Math.random() * 0.06), 0.6 + Math.random() * 0.5, this.tint);
    }
  }

  dispose() { this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ the layer
export class Text3DLayer {
  group = new THREE.Group();
  items: Text3D[] = [];
  private fx = new MiniBubbles();
  constructor() { this.group.name = 'text3d'; this.group.add(this.fx.mesh); }

  add(text: string, x: number, y: number, z: number, st: T3DStyle, o: T3DOpts = {}): Text3D {
    const t = new Text3D(text, st, x, y, z, o);
    t.fx = this.fx;
    this.items.push(t);
    this.group.add(t.group);
    if (this.items.length > 48) { const old = this.items.shift()!; old.dispose(); }
    return t;
  }

  /** a damage number: forms fast, rises, faces the camera square on, pops (crits: bigger, gold, shaking) */
  damage(n: number, x: number, y: number, crit = false, heal = false): Text3D {
    const s = n >= 10 ? String(Math.round(n)) : String(+n.toFixed(1));
    return this.add((heal ? '+' : '') + s + (crit ? '!' : ''), x + (Math.random() - 0.5) * 0.3, y, 0.9, heal ? T3D.heal : crit ? T3D.crit : T3D.damage, {
      size: crit ? 0.62 : 0.4, life: crit ? 1.3 : 0.9, rise: crit ? 1.6 : 1.3, face: 1, angle: 0, bob: 0, stagger: 0.02, shake: crit ? 0.6 : 0, shadow: true,
    });
  }

  update(dt: number, cam: THREE.Camera) {
    tick();
    this.group.updateMatrixWorld();
    for (const t of this.items) t.update(dt, cam);
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].dead) { this.items[i].dispose(); this.items.splice(i, 1); }
    this.fx.update(dt);
  }

  clear() { for (const t of this.items) t.dispose(); this.items.length = 0; this.fx.clear(); }
}

// ------------------------------------------------------------------ a static bubble word (props: the title sign)
/**
 * A word of bubble letters as a plain Group (centred on the origin, cap height `cap` metres, no entrance): for props
 * that own their own placement. The glass still jiggles (its clock ticks whenever it renders).
 */
export function bubbleWord(text: string, st: T3DStyle, cap = 0.5): THREE.Group {
  const g = new THREE.Group();
  const face = faceOf(st.font);
  const ch = capH(face);
  const vox = cap / Math.max(5, ch);
  const lw = measure(text, face);
  const mat = glassMat(st);
  let pen = 0;
  for (const c of text) {
    const gl = bubbleGlyph(c, st);
    const x0 = pen;
    pen += gl.adv;
    if (!gl.geo) continue;
    const m = new THREE.Mesh(gl.geo, mat);
    m.position.set((x0 + gl.cx - lw / 2) * vox, 0, 0);
    m.scale.setScalar(vox);
    m.onBeforeRender = tick;
    g.add(m);
  }
  g.userData.width = lw * vox;
  return g;
}

// ------------------------------------------------------------------ FloatText that sends the big pops to 3D
const ROUTE: Partial<Record<StyleName, T3DStyle>> = { title: T3D.title, item: T3D.item, gold: T3D.gold, danger: T3D.danger, damage: T3D.damage, magic: T3D.magic };

/**
 * a FloatText for World.text: titles, item names, big gold / danger call-outs (WAVE n, WAVE CLEARED, NETTED!),
 * CRIT! and damage numbers become bubble words in `layer`; small hints and barks stay crisp flat sprites.
 */
export class Float3D extends FloatText {
  constructor(public layer: Text3DLayer, public z = 0.9) { super(); }
  pop(text: string, x: number, y: number, style: StyleName = 'shout', o: { size?: number; life?: number; vy?: number; jitter?: number; follow?: () => { x: number; y: number } } = {}) {
    const size = o.size ?? 0.42;
    const st = ROUTE[style];
    const big = style === 'title' || style === 'item' || style === 'damage' || text === 'CRIT!' || (style === 'gold' && size >= 0.4) || (style === 'danger' && size >= 0.5) || (style === 'magic' && size >= 0.4);
    if (!st || !big) return super.pop(text, x, y, style, o);
    const crit = text === 'CRIT!';
    this.layer.add(text, x, y, this.z, crit ? T3D.crit : st, {
      size: size * (crit ? 0.95 : 0.78), life: o.life ?? 1.3, rise: (o.vy ?? 0.9) * 0.8, follow: o.follow, shake: crit || style === 'danger' ? 0.5 : 0,
      enter: size >= 0.6 ? 'drop' : 'pop', face: 0.9,
    });
    return undefined as unknown as ReturnType<FloatText['pop']>;
  }
}
