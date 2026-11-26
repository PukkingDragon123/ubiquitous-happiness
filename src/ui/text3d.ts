// World text (v7): NO 3D text. The API is the old bubble-text one (Text3DLayer / Text3D / T3D / Float3D /
// bubbleWord), but every word is now 2D pixel-font text drawn on the screen's UI canvas (src/ui/seaText.ts), placed
// over the scene by projecting its world point each frame: crisp Jersey glyphs at whole-pixel sizes with a clean
// two-tone fill and a soft dark outline, that float -- they rise into place letter by letter, bob and drift gently
// like things in water, and leave by fading up while a few small, real-looking air bubbles rise off them and pop.
// Bubbles are accents only; the letters themselves are plain, readable text.
//
//   const t3d = new Text3DLayer(); scene.add(t3d.group);           (the group is an empty marker; kept for the API)
//   t3d.add('WAVE 3', x, y, 0.8, T3D.title, { size: 0.9, life: 3 })  a title that floats, bobs and leaves on its own
//   t3d.damage(12, x, y, crit)                                       a rising damage number
//   const sign = t3d.add('SWIM', x, y, z, T3D.hint, { size: 0.45 }); sign.hide()
//   each frame: t3d.update(dt, camera)    draws on the screen UI that is drawing (or the next one to finish a frame)
//
//   new Float3D(t3d)   a FloatText whose pops (titles, item names, damage, call-outs, hints) all go to the layer, so
//                      every world word has the one look; hand it to a World as world.text.
//   bubbleWord('BLOBFISH', T3D.logo, 0.5)   a static word as a Group (centred, cap 0.5 m) for props such as the title
//                                          sign: drawn in 2D over the prop's projected position, with a little fizz
//
// The `size` of a word (cap height in metres) picks its pixel size the first time it is seen: the projected cap is
// snapped to the nearest whole-pixel tier (small 7.5 .. huge 30 UI px), so the letters are never resampled.
import * as THREE from 'three';
import { measure, capH, type FontName } from './pixel/font';
import { FloatText, type StyleName } from './text';
import { PixelUI } from './pixel/ui';
import {
  SeaBubbles, seaArt, seaDraw, seaWidth, seaWidthC, tierSpec, tierCap, tierLh, pickTier, rawCanvas, letterboxBar,
  project, screenUIAlive, onScreenUI, TIERS, type SeaStyle, type Tier,
} from './seaText';

export interface T3DStyle extends SeaStyle {
  /** the font role: 'small' / 'tiny' words stay small (hints, subtitles); others size up to titles */
  font: FontName;
  /** fill: upper / lower part of the letters */
  top: string; bottom: string;
  /** the dark outline round every letter (readability) */
  edge: string;
  /** kept for compatibility (unused in 2D) */
  glow?: number; depth?: number; clear?: number;
}

export const T3D = {
  title: { font: 'title', top: '#fff7d6', bottom: '#ffc04a', edge: '#3a1606', glow: 0.35 },
  gold: { font: 'title', top: '#fffbe0', bottom: '#f4bc3c', edge: '#3a2200', glow: 0.4 },
  danger: { font: 'title', top: '#ffe6e2', bottom: '#ff6a58', edge: '#34040a', glow: 0.35 },
  blood: { font: 'title', top: '#ff8a7a', bottom: '#d8283a', edge: '#1a0004', glow: 0.25, depth: 6 },
  hint: { font: 'small', top: '#f0fdff', bottom: '#a6ecff', edge: '#06283a', glow: 0.45 },
  item: { font: 'title', top: '#ffffff', bottom: '#b4e0ff', edge: '#0c2440', glow: 0.45 },
  name: { font: 'title', top: '#fff4d2', bottom: '#ffd888', edge: '#2a1408', glow: 0.35 },
  damage: { font: 'title', top: '#ffffff', bottom: '#ffd2c8', edge: '#4a0612', glow: 0.5 },
  crit: { font: 'title', top: '#fff8b0', bottom: '#ff9a2a', edge: '#3e0c00', glow: 0.6 },
  heal: { font: 'title', top: '#f4fff6', bottom: '#78e8a0', edge: '#073a22', glow: 0.5 },
  magic: { font: 'title', top: '#ffffff', bottom: '#cfa4ff', edge: '#240a40', glow: 0.5 },
  logo: { font: 'title', top: '#fff6c8', bottom: '#ffbe4a', edge: '#321200', glow: 0.3, depth: 6 },
  sub: { font: 'small', top: '#e6faff', bottom: '#8ad6ff', edge: '#03203a', glow: 0.45 },
  shout: { font: 'title', top: '#ffffff', bottom: '#ffd65a', edge: '#3a1600', glow: 0.4 },
  body: { font: 'small', top: '#f6f9ff', bottom: '#d2e2f2', edge: '#0b1626', glow: 0.3 },
} satisfies Record<string, T3DStyle>;
export type T3DName = keyof typeof T3D;

/** kept for compatibility: the old legibility floor of the 3D words (unused by the 2D text) */
export const TEXT3D_VIEW = { lowResH: 440, minPx: 1.7, minCap: 19, minCapSmall: 13 };

// ------------------------------------------------------------------ bubble props (3D instanced bubbles, not text)
const U_TIME = { value: 0 };
const tick = () => { U_TIME.value = (performance.now() / 1000) % 3600; };
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
  p *= 1.0 + 0.08 * sin(uTime * 7.0 + ph + p.y * 2.0);
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
// matte air bubbles: a soft rim and a faint body, one small dull highlight (no white glare)
const MINI_FS = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vCol;
varying float vFade;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 1.7);
  vec3 L = normalize(vec3(-0.45, 0.8, 0.55));
  float s = max(dot(reflect(-V, N), L), 0.0);
  float hi = smoothstep(0.92, 0.96, s);
  // a real air bubble: nearly clear body, a rim that is pale where the light from above catches it and a darker,
  // refracting teal low down, one small dull highlight (matte: no white glare)
  float up = N.y * 0.5 + 0.5;
  vec3 rim = mix(vec3(0.28, 0.52, 0.6), vec3(0.84, 0.94, 0.95), smoothstep(0.25, 0.75, up));
  vec3 col = mix(vCol * 0.8, rim, fr) + hi * 0.28;
  float a = clamp(0.1 + fr * 0.8 + hi * 0.35, 0.0, 1.0);
  gl_FragColor = vec4(col, a * abs(vFade));
}`;
let miniMat: THREE.ShaderMaterial | null = null;
function miniMaterial() {
  return (miniMat ??= new THREE.ShaderMaterial({ vertexShader: MINI_VS, fragmentShader: MINI_FS, transparent: true, depthWrite: false, uniforms: { uTime: U_TIME } }));
}

/**
 * `n` air bubbles as one instanced mesh (a matte rim, a faint body, a gentle wobble): place each with setMatrixAt
 * (a scale = its radius) and tint it with setColorAt. Props use it (the tutorial's bubble rings). Not for text.
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

// ------------------------------------------------------------------ a word in the world
export interface T3DOpts {
  /** cap height in metres (default 0.6): picks the pixel size the first time the word is seen */
  size?: number;
  /** seconds until it leaves on its own (0 = stays until hide()) */
  life?: number;
  /** bob amplitude (in letter heights) and the wave phase between letters */
  bob?: number; wave?: number;
  /** seconds between letters appearing */
  stagger?: number;
  /** delay before the first letter */
  delay?: number;
  /** rise speed (m/s, damped) */
  rise?: number;
  /** kept for compatibility (2D words always face the screen) */
  face?: number; angle?: number; tilt?: number;
  /** follow a moving point (x, y, z added to the position) */
  follow?: () => { x: number; y: number; z?: number };
  /** shake the letters (crits, BREAD!!) */
  shake?: number;
  /** kept for compatibility */
  shadow?: boolean;
  /** entrance: 'pop' (letters rise into place one by one), 'drop' (they fall in from above with a soft bounce),
   *  'slam' (all at once, hard, with a burst of bubbles) */
  enter?: 'pop' | 'drop' | 'slam';
  /** called when a letter has landed */
  onLand?: (i: number) => void;
}

interface Letter {
  ch: string; i: number; line: number;
  /** pen offset from the line's start, canvas px (for the current layout) */
  x: number;
  /** advance in canvas px */
  w: number;
  landed: boolean; left: boolean;
}

const _v = new THREE.Vector3();
const easeOutBack = (k: number, s = 1.70158) => { const t = k - 1; return 1 + t * t * ((s + 1) * t + s); };

export class Text3D {
  /** kept for the API: an empty marker that follows the word (not rendered) */
  group = new THREE.Group();
  letters: Letter[] = [];
  t = 0;
  outT = -1;
  dead = false;
  pos = new THREE.Vector3();
  readonly width: number;
  readonly text: string;
  readonly st: T3DStyle;
  private o: Required<Omit<T3DOpts, 'follow' | 'onLand' | 'tilt'>> & Pick<T3DOpts, 'follow' | 'onLand' | 'tilt'>;
  private lines: string[];
  private riseV: number;
  private small: boolean;
  /** quick words (damage numbers): no bubble accents on the way in / out */
  private quick: boolean;
  private seed = Math.random() * 6.28;
  /** chosen on first sight */
  private tier: Tier | null = null;
  private layHd = 0;
  private lineW: number[] = [];
  private trailT: number;
  private trailDue = 0;
  private slamDone = false;

  constructor(text: string, st: T3DStyle, x: number, y: number, z: number, o: T3DOpts = {}) {
    this.text = text;
    this.st = st;
    this.o = {
      size: o.size ?? 0.6, life: o.life ?? 0, bob: o.bob ?? 0.06, wave: o.wave ?? 0.55, stagger: o.stagger ?? 0.045, delay: o.delay ?? 0,
      rise: o.rise ?? 0, face: o.face ?? 0.85, angle: o.angle ?? 0, shake: o.shake ?? 0, shadow: o.shadow ?? true, enter: o.enter ?? 'pop',
      follow: o.follow, onLand: o.onLand, tilt: o.tilt,
    };
    this.riseV = this.o.rise;
    this.pos.set(x, y, z);
    this.group.position.copy(this.pos);
    this.small = st.font === 'small' || st.font === 'tiny';
    this.quick = this.o.stagger <= 0.025 && this.o.life > 0 && this.o.life <= 1.4;
    this.trailT = 0.5 + Math.random() * 0.8;
    this.lines = text.split('\n');
    let idx = 0;
    this.lines.forEach((line, li) => {
      for (const ch of line) {
        if (!ch.trim()) continue;
        this.letters.push({ ch, i: idx++, line: li, x: 0, w: 0, landed: false, left: false });
      }
    });
    // world width at the nominal size (a Jersey 15 word scaled to the cap)
    let maxW = 0;
    for (const l of this.lines) maxW = Math.max(maxW, measure(l, 'hd15'));
    this.width = (maxW / Math.max(1, capH('hd15'))) * this.o.size;
  }

  get alive() { return !this.dead; }
  get out() { return this.outT >= 0; }
  /** leave now (or after `after` seconds) */
  hide(after = 0) { if (this.outT < 0) this.outT = this.t + after; }
  /** retime its life */
  setLife(sec: number) { this.o.life = this.t + sec; }

  /** advance time (rise, life, the bubble trail); the drawing happens in draw() */
  update(dt: number, _cam?: THREE.Camera) {
    this.t += dt;
    const o = this.o;
    if (o.life > 0 && this.t >= o.life && this.outT < 0) this.outT = this.t;
    if (this.riseV) { this.pos.y += this.riseV * dt; this.riseV *= Math.exp(-dt * 2.2); }
    const f = o.follow?.();
    this.group.position.set(this.pos.x + (f?.x ?? 0), this.pos.y + (f?.y ?? 0), this.pos.z + (f?.z ?? 0));
    if (this.outT >= 0) {
      const n = this.letters.length;
      if (this.t - this.outT > Math.max(0, n - 1) * o.stagger * 0.5 + 0.24) this.dead = true;
    } else if (!this.quick && this.t > o.delay) {
      this.trailT -= dt * (this.riseV > 0.2 ? 3 : 1);
      if (this.trailT <= 0) { this.trailT = 0.7 + Math.random() * 1.1; this.trailDue++; }
    }
  }

  private layout(hd: number) {
    const { face, k } = tierSpec(this.tier!, hd);
    this.lineW = this.lines.map((l) => measure(l, face) * k);
    let li = 0, j = 0;
    for (const L of this.letters) {
      // find this letter's place in its line (spaces are skipped in letters but count in the pen)
      if (L.line !== li) { li = L.line; j = 0; }
      const line = this.lines[li];
      while (j < line.length && line[j] !== L.ch) j++;
      L.x = measure(line.slice(0, j), face) * k;
      L.w = measure(L.ch, face) * k;
      j++;
    }
    this.layHd = hd;
  }

  /** draw on a UI (ctx in raw canvas px); `mw` = the layer's world matrix */
  draw(ui: PixelUI, ctx: CanvasRenderingContext2D, hd: number, cam: THREE.Camera, fx: SeaBubbles, mw: THREE.Matrix4 | null) {
    const o = this.o, n = this.letters.length;
    if (!n || this.dead) return;
    _v.copy(this.group.position);
    if (mw) _v.applyMatrix4(mw);
    const pr = project(ui, cam, _v);
    if (pr.behind) return;
    if (!this.tier) {
      // the projected cap, a little compressed (2D words don't need to be as big as 3D ones did), snapped to a tier;
      // the authored size caps it so labels stay labels and only real titles get the big faces
      const big = !this.small && o.size >= 0.7;
      const cap = (o.size / pr.perPx) * (big ? 1 : 0.65);
      const max: Tier = this.small ? (o.size >= 0.3 ? 'title' : 'body') : big ? 'huge' : o.size >= 0.45 ? 'big' : 'title';
      this.tier = pickTier(cap, hd, this.small ? 'small' : big ? 'big' : 'body', max);
    }
    if (this.layHd !== hd) this.layout(hd);
    const tier = this.tier;
    const capU = tierCap(tier, hd), lh = tierLh(tier);
    const blockH = (this.lines.length - 1) * lh + capU;
    // the whole word drifts and sways a little, like something hanging in the water
    const t = this.t;
    const driftX = Math.sin(t * 0.8 + this.seed) * 0.8, driftY = Math.sin(t * 1.25 + this.seed * 1.7) * 0.5;
    const cx = pr.x + driftX, top = pr.y - blockH / 2 + driftY;
    if (cx < -ui.w * 0.5 || cx > ui.w * 1.5 || top > ui.h + 40 || top + blockH < -40) return;
    const bobA = Math.max(0.5, o.bob * capU);
    const shakeQ = Math.floor(t * 30);
    type P = { X: number; Y: number; a: number; L: Letter };
    const ps: P[] = [];
    const lineX = this.lineW.map((w) => Math.round(cx * hd - w / 2));
    for (const L of this.letters) {
      const li = t - o.delay - L.i * o.stagger;
      if (li < 0) continue;
      const outK = this.outT >= 0 ? t - this.outT - (n - 1 - L.i) * o.stagger * 0.5 : -1;
      if (outK > 0 && !L.landed) continue;
      let a = 1, dy = 0, dx = 0;
      // entrance
      if (o.enter === 'drop') {
        const e = li / 0.32;
        if (e < 1) { dy = -12 * (1 - e * e); a = Math.min(1, e * 3); }
        else { const s = li - 0.32; dy = Math.sin(s * 17) * Math.exp(-s * 8) * 2; }
      } else if (o.enter === 'slam') {
        const e = li / 0.07;
        if (e < 1) { dy = -7 * (1 - e); a = Math.min(1, e * 2); }
        else { const s = li - 0.07, q = Math.exp(-s * 12) * 2.2; dx += Math.sin(s * 70 + L.i) * q; dy += Math.cos(s * 63 + L.i * 2) * q * 0.6; }
      } else {
        const e = Math.min(1, li / 0.2);
        dy = (1 - easeOutBack(e, 2.2)) * 5;
        a = Math.min(1, li / 0.1);
      }
      if (!L.landed && li > 0.06) {
        L.landed = true;
        o.onLand?.(L.i);
        // a bubble or two shed as the letters arrive (accents: every third letter)
        if (!this.quick && L.i % 3 === 1) fx.add((lineX[L.line] + L.x + L.w / 2) / hd, top + L.line * lh + capU * 0.6, { r: 0.9 + Math.random() * 0.8, life: 0.5 + Math.random() * 0.6 });
      }
      // leaving: fade up and away; every other letter lets a bubble go that pops a moment later
      if (outK > 0) {
        const q = Math.min(1, outK / 0.2);
        a *= 1 - q; dy -= q * 4;
        if (!L.left) {
          L.left = true;
          if (!this.quick && L.i % 2 === 0) fx.add((lineX[L.line] + L.x + L.w / 2) / hd, top + L.line * lh + capU * 0.4, { r: 1 + Math.random() * (tier === 'huge' || tier === 'big' ? 1.4 : 0.7), life: 0.12 + Math.random() * 0.3, vy: -18 });
        }
      }
      // floating: a slow bob that travels along the word
      dy += Math.sin(t * 2.2 - L.i * o.wave + this.seed) * bobA;
      if (o.shake) { const r1 = Math.sin(shakeQ * 12.9898 + L.i * 78.233) * 43758.5453, r2 = Math.sin(shakeQ * 4.1414 + L.i * 31.71) * 24634.6345; dx += (r1 - Math.floor(r1) - 0.5) * o.shake * 2.2; dy += (r2 - Math.floor(r2) - 0.5) * o.shake * 1.6; }
      if (a <= 0.01) continue;
      ps.push({ X: lineX[L.line] + L.x + Math.round(dx * hd), Y: Math.round((top + L.line * lh + dy) * hd), a, L });
    }
    if (o.enter === 'slam' && !this.slamDone && ps.length) {
      this.slamDone = true;
      for (let j = 0; j < 6; j++) { const p = ps[(j * 3) % ps.length]; fx.add((p.X + p.L.w / 2) / hd, p.Y / hd + capU * 0.5, { r: 1 + Math.random() * 1.4, vx: (Math.random() - 0.5) * 30, vy: -14 - Math.random() * 16, life: 0.35 + Math.random() * 0.5 }); }
    }
    // the trail: now and then a small bubble lets go of a letter's top and rises
    while (this.trailDue > 0) {
      this.trailDue--;
      if (!ps.length) break;
      const p = ps[Math.floor(Math.random() * ps.length)];
      fx.add((p.X + p.L.w * (0.25 + Math.random() * 0.5)) / hd, p.Y / hd - 1, { r: 0.8 + Math.random() * (capU > 14 ? 1.1 : 0.6), life: 0.7 + Math.random() * 0.9 });
    }
    for (const p of ps) seaDraw(ctx, seaArt(p.L.ch, this.st, tier, hd), p.X, p.Y, 'edge', p.a);
    for (const p of ps) seaDraw(ctx, seaArt(p.L.ch, this.st, tier, hd), p.X, p.Y, 'fill', p.a);
  }

  dispose() { this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ the layer
export class Text3DLayer {
  /** an empty marker (screens add it to their scene); words are placed in its space */
  group = new THREE.Group();
  items: Text3D[] = [];
  private fx = new SeaBubbles();
  private cam: THREE.Camera | null = null;
  private fxDt = 0;
  private queued = false;
  constructor() { this.group.name = 'text3d'; }

  add(text: string, x: number, y: number, z: number, st: T3DStyle, o: T3DOpts = {}): Text3D {
    const t = new Text3D(text, st, x, y, z, o);
    this.items.push(t);
    if (this.items.length > 48) { const old = this.items.shift()!; old.dispose(); }
    return t;
  }

  /** a damage number: pops in fast, rises and fades (crits: bigger, gold, shaking) */
  damage(n: number, x: number, y: number, crit = false, heal = false): Text3D {
    const s = n >= 10 ? String(Math.round(n)) : String(+n.toFixed(1));
    return this.add((heal ? '+' : '') + s + (crit ? '!' : ''), x + (Math.random() - 0.5) * 0.3, y, 0.9, heal ? T3D.heal : crit ? T3D.crit : T3D.damage, {
      size: crit ? 0.62 : 0.4, life: crit ? 1.3 : 0.9, rise: crit ? 1.6 : 1.3, bob: 0, stagger: 0.02, shake: crit ? 0.6 : 0, enter: crit ? 'slam' : 'pop',
    });
  }

  update(dt: number, cam: THREE.Camera) {
    this.cam = cam;
    this.fxDt += dt;
    for (const t of this.items) t.update(dt, cam);
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].dead) { this.items[i].dispose(); this.items.splice(i, 1); }
    if (!this.items.length && !this.fx.count) return;
    const ui = PixelUI.current;
    if (ui) this.draw(ui);
    else if (!this.queued) { this.queued = true; PixelUI.overlay.push(this.drawQ); }
  }

  private drawQ = (ui: PixelUI) => { this.queued = false; this.draw(ui); };

  private draw(ui: PixelUI) {
    const cam = this.cam;
    if (!cam) return;
    const dt = Math.min(0.1, this.fxDt); this.fxDt = 0;
    this.fx.step(dt);
    const bar = letterboxBar(ui);
    const clip: [number, number] = [bar, ui.h - bar];
    this.group.updateWorldMatrix(true, false);
    const mw = this.group.parent ? this.group.matrixWorld : null;
    rawCanvas(ui, (ctx, hd) => {
      if (bar > 0) { ctx.beginPath(); ctx.rect(0, clip[0] * hd, ui.w * hd, (clip[1] - clip[0]) * hd); ctx.clip(); }
      for (const t of this.items) t.draw(ui, ctx, hd, cam, this.fx, mw);
    });
    this.fx.draw(ui, clip);
  }

  clear() { for (const t of this.items) t.dispose(); this.items.length = 0; this.fx.clear(); }
}

// ------------------------------------------------------------------ a word pinned to a prop (title sign, menus)
export interface AnchorOpts {
  /** bubbles per ~10 s that rise off the word (0 = none) */
  fizz?: number;
  /** size from the projected cap height ('cap') or fit the projected `width` (metres, before scale) */
  fit?: 'cap' | 'width';
  width?: number;
  min?: Tier; max?: Tier;
}

/**
 * A word pinned to a point of the 3D scene, drawn in 2D: returns a marker Mesh (place / parent it like any object;
 * its world position is the word's centre, its world scale scales `capM`). While a screen UI is drawing, the mesh
 * draws nothing in 3D and the word is drawn on that UI over the marker's projected position (crisp pixel text at
 * the nearest whole-pixel size). Screens with no UI canvas get a flat pixel-text card in its place instead.
 */
export function anchoredWord(text: string, st: SeaStyle, capM: number, o: AnchorOpts = {}): THREE.Mesh {
  // the fallback card: the same art at the base density, centred on the cap
  const art = seaArt(text, st, 'title', 1);
  const W = art.fill.width, H = art.fill.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c2 = cv.getContext('2d')!; c2.drawImage(art.edge, 0, 0); c2.drawImage(art.fill, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.colorSpace = THREE.SRGBColorSpace;
  const mPerPx = capM / Math.max(1, art.cap);
  const geo = new THREE.PlaneGeometry(W * mPerPx, H * mPerPx);
  geo.translate((W / 2 - (art.pad + art.adv / 2)) * mPerPx, -(H / 2 - (art.pad + art.cap / 2)) * mPerPx, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.renderOrder = 5;
  const fx = new SeaBubbles();
  const st2 = { cam: null as THREE.Camera | null, queued: false, tier: null as Tier | null, capSeen: 0, hd: 0, last: performance.now(), fizzT: 1 + Math.random() * 2, seed: Math.random() * 6.28 };
  const pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const draw = (ui: PixelUI) => {
    st2.queued = false;
    const cam = st2.cam;
    if (!cam || !mesh.parent) return;
    const now = performance.now(), dt = Math.min(0.1, (now - st2.last) / 1000); st2.last = now;
    mesh.updateWorldMatrix(true, false);
    pos.setFromMatrixPosition(mesh.matrixWorld);
    scl.setFromMatrixScale(mesh.matrixWorld);
    const s = Math.max(scl.x, scl.y);
    const pr = project(ui, cam, pos);
    if (pr.behind) return;
    const hd = Math.max(1, ui.hd);
    const capUI = (capM * s) / pr.perPx;
    // pick a whole-pixel size; re-pick only when the projected size has changed a lot (no popping as cameras drift)
    if (!st2.tier || st2.hd !== hd || Math.abs(Math.log(capUI / Math.max(0.01, st2.capSeen))) > 0.3) {
      st2.capSeen = capUI; st2.hd = hd;
      const lo = o.min ?? 'title', hi = o.max ?? 'giant';
      if (o.fit === 'width' && o.width) {
        const want = (o.width * s) / pr.perPx;
        let best: Tier = lo;
        for (let i = TIERS.indexOf(lo); i <= TIERS.indexOf(hi); i++) if (seaWidth(text, TIERS[i], hd) <= want * 1.06) best = TIERS[i];
        st2.tier = best;
      } else st2.tier = pickTier(capUI, hd, lo, hi);
    }
    const tier = st2.tier!;
    const a = seaArt(text, st, tier, hd);
    const t = now / 1000;
    const X = Math.round(pr.x * hd - a.adv / 2 + Math.sin(t * 0.7 + st2.seed) * 0.6 * hd);
    const Y = Math.round(pr.y * hd - a.cap / 2 + Math.sin(t * 1.4 + st2.seed) * 0.8 * hd);
    rawCanvas(ui, (ctx) => { seaDraw(ctx, a, X, Y, 'edge', 1); seaDraw(ctx, a, X, Y, 'fill', 1); });
    // a little fizz: small bubbles let go of the top of the word now and then
    if (o.fizz) {
      st2.fizzT -= dt * (o.fizz / 10);
      if (st2.fizzT <= 0) { st2.fizzT = 0.6 + Math.random() * 0.8; fx.add((X + a.adv * (0.1 + Math.random() * 0.8)) / hd, Y / hd - 1, { r: 0.9 + Math.random() * 1.2, life: 0.8 + Math.random() * 1 }); }
    }
    fx.step(dt);
    fx.draw(ui);
  };
  mesh.onBeforeRender = (_r, _s, cam) => {
    const live = screenUIAlive(500);
    mat.colorWrite = !live;
    if (!live) return;
    st2.cam = cam;
    if (!st2.queued) { st2.queued = true; onScreenUI(draw); }
  };
  return mesh;
}

/**
 * A static word as a Group (centred on the origin, cap height `cap` metres) for props that own their own placement
 * (the title sign): drawn in 2D over the prop (anchoredWord), fitted to its projected width, with a small fizz of
 * bubbles. userData.width = its width in metres at `cap`.
 */
export function bubbleWord(text: string, st: T3DStyle, cap = 0.5, fizz = 10): THREE.Group {
  const g = new THREE.Group();
  const width = (seaWidthC(text, 'title', 1) / Math.max(1, tierCap('title', 1))) * cap;
  g.add(anchoredWord(text, st, cap, { fizz, fit: 'width', width, min: 'title', max: 'giant' }));
  g.userData.width = width;
  return g;
}

// ------------------------------------------------------------------ FloatText that sends every pop to the layer
const ROUTE: Record<StyleName, T3DStyle> = {
  title: T3D.title, shout: T3D.shout, damage: T3D.damage, heal: T3D.heal, gold: T3D.gold, item: T3D.item,
  body: T3D.body, small: T3D.body, hint: T3D.hint, danger: T3D.danger, magic: T3D.magic,
};

/**
 * a FloatText for World.text: every pop (titles, item names, call-outs, damage, hints, barks) becomes a floating 2D
 * word in `layer`, so all world text shares one look. (With no screen UI drawing at all -- a bare dev preview -- it
 * falls back to FloatText's flat sprites.)
 */
export class Float3D extends FloatText {
  constructor(public layer: Text3DLayer, public z = 0.9) { super(); }
  pop(text: string, x: number, y: number, style: StyleName = 'shout', o: { size?: number; life?: number; vy?: number; jitter?: number; follow?: () => { x: number; y: number } } = {}) {
    if (!screenUIAlive(1500)) return super.pop(text, x, y, style, o);
    const size = o.size ?? 0.42;
    const crit = text === 'CRIT!';
    const st = crit ? T3D.crit : ROUTE[style] ?? T3D.title;
    const life = o.life ?? 1.3;
    const quick = style === 'damage' || style === 'heal';
    this.layer.add(text, x, y, this.z, st, {
      size: size * (crit ? 0.95 : 0.85), life, rise: (o.vy ?? 0.9) * 0.8, follow: o.follow,
      shake: crit ? 0.6 : style === 'danger' || style === 'shout' ? 0.25 : 0,
      enter: crit || (size >= 0.6 && style === 'danger') ? 'slam' : size >= 0.6 ? 'drop' : 'pop',
      stagger: quick ? 0.02 : 0.035, bob: quick ? 0 : 0.06,
    });
    return undefined as unknown as ReturnType<FloatText['pop']>;
  }
}
