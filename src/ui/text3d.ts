// 3D floating text: chunky extruded pixel-font letters that live in the world. Every pixel of a glyph from the
// bundled pixel fonts (src/ui/pixel/font.ts) becomes a voxel column: the letter face stands one voxel proud of its
// dark outline ring, the side walls are shaded darker, and the whole thing is a lit, flat-shaded, shadow-casting
// mesh (MeshStandard + vertex colours, a little self-glow so it reads in deep water). Each letter is its own mesh
// so words pop in letter by letter with squash and stretch, bob in a wave, and squash out again.
//
//   const t3d = new Text3DLayer(); scene.add(t3d.group);           in the LIT scene (not an overlay)
//   t3d.add('WAVE 3', x, y, 0.8, T3D.title, { size: 0.9, life: 3 })  a title that floats, bobs and pops out
//   t3d.damage(12, x, y, crit)                                       a rising damage number
//   const sign = t3d.add('SWIM ← →', x, y, z, T3D.hint, { size: 0.45 }); sign.hide()
//   each frame: t3d.update(dt, camera)
//
//   new Float3D(t3d)   a FloatText that sends the big pops (titles, item names, crits, WAVE n) to 3D and keeps the
//                      small hints flat; hand it to a World as world.text.
import * as THREE from 'three';
import { glyphs, measure, type FontName } from './pixel/font';
import { FloatText, type StyleName } from './text';

export interface T3DStyle {
  font: FontName;
  /** face colours: upper / lower half of the glyph (stepped two-tone, like the pixel UI) */
  top: string; bottom: string;
  /** the outline ring (one voxel shallower than the face) */
  edge: string;
  /** self-glow of the face colour 0..1 (readability in deep water) */
  glow?: number;
  /** voxel depth of the face (the outline is one less) */
  depth?: number;
}

export const T3D = {
  title: { font: 'title', top: '#fff7d6', bottom: '#ffb43a', edge: '#4a1c08', glow: 0.35 },
  gold: { font: 'title', top: '#fffbe0', bottom: '#f0b030', edge: '#4a2a00', glow: 0.4 },
  danger: { font: 'title', top: '#ffe0e0', bottom: '#ff4a3a', edge: '#3a0006', glow: 0.35 },
  blood: { font: 'title', top: '#ff6a5a', bottom: '#b80e18', edge: '#1a0004', glow: 0.25, depth: 4 },
  hint: { font: 'small', top: '#f0fdff', bottom: '#8ae8ff', edge: '#06303f', glow: 0.45 },
  item: { font: 'title', top: '#ffffff', bottom: '#9fd6ff', edge: '#0c2a4a', glow: 0.45 },
  name: { font: 'title', top: '#fff2c8', bottom: '#ffd27a', edge: '#2a1408', glow: 0.35 },
  damage: { font: 'title', top: '#ffffff', bottom: '#ffd0c8', edge: '#5a0614', glow: 0.5 },
  crit: { font: 'title', top: '#fff6a0', bottom: '#ff8a1a', edge: '#4a0e00', glow: 0.6 },
  heal: { font: 'title', top: '#ffffff', bottom: '#5ae08a', edge: '#0b4a2a', glow: 0.5 },
  magic: { font: 'title', top: '#ffffff', bottom: '#c08cff', edge: '#2a0c4a', glow: 0.5 },
  logo: { font: 'title', top: '#fff6c8', bottom: '#ffb43a', edge: '#3a1400', glow: 0.3, depth: 4 },
  sub: { font: 'small', top: '#dff8ff', bottom: '#4ac8ff', edge: '#02203a', glow: 0.45 },
} satisfies Record<string, T3DStyle>;
export type T3DName = keyof typeof T3D;

// ------------------------------------------------------------------ geometry
interface GlyphGeo { geo: THREE.BufferGeometry | null; w: number; h: number }
const geoCache = new Map<string, GlyphGeo>();
const matCache = new Map<string, THREE.MeshStandardMaterial>();

/** classify a glyph's pixels: 0 empty, 1 face (upper), 2 face (lower), 3 outline */
function glyphMask(ch: string, font: FontName): { m: Uint8Array; w: number; h: number } {
  const g = glyphs(ch, { font, color: '#ffffff', color2: '#808080', outline: '#000000' });
  const ctx = g.cv.getContext('2d', { willReadFrequently: true })!;
  const d = ctx.getImageData(0, 0, g.w, g.h).data;
  const m = new Uint8Array(g.w * g.h);
  for (let i = 0; i < g.w * g.h; i++) {
    if (d[i * 4 + 3] < 128) continue;
    const r = d[i * 4];
    m[i] = r > 200 ? 1 : r > 90 ? 2 : 3;
  }
  return { m, w: g.w, h: g.h };
}

/**
 * extrude a classified pixel mask into voxel columns (v4: a deeper, bevelled letter). Per pixel:
 *   face core      depth D, a 4-step top-to-bottom gradient (st.top -> st.bottom), the top rim lit near-white
 *   face bevel     depth D - 1: the ring of face pixels touching the outline, lit on the top / left, shaded on the
 *                  bottom / right, so every letter has a stepped chamfer
 *   outline        depth D - 2, the dark ring
 * Side walls appear wherever a column stands above its neighbour (darker, lit from above). Runs of equal pixels in
 * a row merge into one quad. Origin: bottom centre of the mask (letters squash from their feet).
 */
function extrude(mask: { m: Uint8Array; w: number; h: number }, st: T3DStyle): THREE.BufferGeometry | null {
  const { m, w, h } = mask;
  const D = st.depth ?? 5;
  const isFace = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && (m[y * w + x] === 1 || m[y * w + x] === 2);
  const any = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] > 0;
  // face rows span (for the gradient)
  let fy0 = h, fy1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isFace(x, y)) { fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y); }
  const top = new THREE.Color(st.top), bot = new THREE.Color(st.bottom), edge = new THREE.Color(st.edge), white = new THREE.Color('#ffffff');
  const dep = new Float32Array(w * h), col: THREE.Color[] = new Array(w * h), key = new Array<string>(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (!any(x, y)) continue;
    let c: THREE.Color, d: number;
    if (!isFace(x, y)) { c = edge.clone(); d = D - 2; }
    else {
      const k = fy1 > fy0 ? Math.min(3, Math.floor(((y - fy0) / (fy1 - fy0 + 1)) * 4)) / 3 : 0;
      c = top.clone().lerp(bot, k);
      // pixel fonts have 1-2 px strokes, so a per-pixel bevel would just stripe them: the chamfer is the 2-voxel step
      // down to the outline (its walls are lit / shaded below); the face gets a lit top rim and a soft left edge
      const core = isFace(x - 1, y) && isFace(x + 1, y) && isFace(x, y - 1) && isFace(x, y + 1);
      if (!isFace(x, y - 1)) c.lerp(white, 0.5);
      else if (!isFace(x - 1, y)) c.lerp(white, 0.12);
      d = core ? D : D - 0.5;
    }
    dep[i] = d; col[i] = c; key[i] = c.getHexString() + d;
  }
  const P: number[] = [], N: number[] = [], C: number[] = [];
  const depAt = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h || !col[y * w + x] ? 0 : dep[y * w + x]);
  const ox = -w / 2;
  const quad = (a: number[], b2: number[], c: number[], d: number[], n: number[], cc: THREE.Color) => {
    for (const v of [a, b2, c, a, c, d]) { P.push(v[0], v[1], v[2]); N.push(n[0], n[1], n[2]); C.push(cc.r, cc.g, cc.b); }
  };
  const back = edge.clone().multiplyScalar(0.5);
  for (let y = 0; y < h; y++) {
    const yb = h - 1 - y, yt = yb + 1;
    let x = 0;
    while (x < w) {
      const i0 = y * w + x;
      if (!col[i0]) { x++; continue; }
      let e = x + 1;
      while (e < w && key[y * w + e] === key[i0]) e++;
      const d = dep[i0], cc = col[i0];
      const x0 = x + ox, x1 = e + ox;
      quad([x0, yb, d], [x1, yb, d], [x1, yt, d], [x0, yt, d], [0, 0, 1], cc);
      quad([x1, yb, 0], [x0, yb, 0], [x0, yt, 0], [x1, yt, 0], [0, 0, -1], back);
      const wall = cc.clone().multiplyScalar(0.5);
      const dl = depAt(x - 1, y), dr = depAt(e, y);
      if (dl < d) quad([x0, yb, dl], [x0, yb, d], [x0, yt, d], [x0, yt, dl], [-1, 0, 0], wall.clone().multiplyScalar(1.1));
      if (dr < d) quad([x1, yb, d], [x1, yb, dr], [x1, yt, dr], [x1, yt, d], [1, 0, 0], wall.clone().multiplyScalar(0.8));
      for (const dir of [-1, 1]) {
        let i = x;
        while (i < e) {
          const nd = depAt(i, y + dir);
          if (nd >= d) { i++; continue; }
          let j = i + 1;
          while (j < e && depAt(j, y + dir) === nd) j++;
          const a0 = i + ox, a1 = j + ox;
          const isTop = dir < 0;
          const yy = isTop ? yt : yb;
          const c2 = wall.clone().multiplyScalar(isTop ? 1.5 : 0.65);
          if (isTop) quad([a0, yy, d], [a1, yy, d], [a1, yy, nd], [a0, yy, nd], [0, 1, 0], c2);
          else quad([a0, yy, nd], [a1, yy, nd], [a1, yy, d], [a0, yy, d], [0, -1, 0], c2);
          i = j;
        }
      }
      x = e;
    }
  }
  if (!P.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.translate(0, 0, -D / 2);
  g.computeBoundingSphere();
  return g;
}

/** a soft drop shadow behind every letter (same geometry, flat dark, offset down-right and back) */
const shadowMat = new THREE.MeshBasicMaterial({ color: '#02060c', transparent: true, opacity: 0.42, depthWrite: false });

function styleKey(st: T3DStyle) { return [st.font, st.top, st.bottom, st.edge, st.depth ?? 5].join('|'); }

function glyphGeo(ch: string, st: T3DStyle): GlyphGeo {
  const key = ch + '\u0000' + styleKey(st);
  let g = geoCache.get(key);
  if (!g) {
    const mk = glyphMask(ch, st.font);
    g = { geo: ch.trim() ? extrude(mk, st) : null, w: mk.w, h: mk.h };
    geoCache.set(key, g);
  }
  return g;
}

/** the lit voxel material (vertex colours + a self-glow of the same colour) */
function material(st: T3DStyle): THREE.MeshStandardMaterial {
  const key = styleKey(st) + '|' + (st.glow ?? 0.3);
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.08 });
    const glow = { value: st.glow ?? 0.3 };
    m.userData.glow = glow;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uGlow = glow;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vColor.rgb * uGlow;');
    };
    m.customProgramCacheKey = () => 'text3d';
    matCache.set(key, m);
  }
  return m;
}

/** the internal height the 3D scene renders at (src/gfx/post.ts lowResH) and the minimum glyph pixel size there */
export const TEXT3D_VIEW = { lowResH: 440, minPx: 1.7 };

// ------------------------------------------------------------------ a word in the world
export interface T3DOpts {
  /** cap height in metres (default 0.6) */
  size?: number;
  /** seconds until it pops out on its own (0 = stays until hide()) */
  life?: number;
  /** bob amplitude (in letter heights) and the wave phase between letters */
  bob?: number; wave?: number;
  /** seconds between letters popping in */
  stagger?: number;
  /** delay before the first letter */
  delay?: number;
  /** rise speed (m/s, damped) */
  rise?: number;
  /** how much the word turns to face the camera (0..1) and the slight angle it keeps (radians of yaw) */
  face?: number; angle?: number;
  /** follow a moving point (x, y, z added to the position) */
  follow?: () => { x: number; y: number; z?: number };
  /** shake the letters (crits, BREAD!!) */
  shake?: number;
  /** cast shadows (default true) */
  shadow?: boolean;
  /** entrance: 'pop' (springs up from the baseline), 'drop' (falls in), 'slam' (big and heavy) */
  enter?: 'pop' | 'drop' | 'slam';
  /** called when a letter lands (slam thuds, ticks) */
  onLand?: (i: number) => void;
}

interface Letter { mesh: THREE.Mesh; i: number; sy: number; vy: number; landed: boolean; base: number; ry: number; vry: number }

export class Text3D {
  group = new THREE.Group();
  private inner = new THREE.Group();
  letters: Letter[] = [];
  t = 0;
  outT = -1;
  dead = false;
  pos = new THREE.Vector3();
  private o: Required<Omit<T3DOpts, 'follow' | 'onLand'>> & Pick<T3DOpts, 'follow' | 'onLand'>;
  private yaw = 0;
  private vox: number;
  private riseV: number;
  readonly width: number;
  readonly text: string;

  constructor(text: string, st: T3DStyle, x: number, y: number, z: number, o: T3DOpts = {}) {
    this.text = text;
    this.o = {
      size: o.size ?? 0.6, life: o.life ?? 0, bob: o.bob ?? 0.06, wave: o.wave ?? 0.55, stagger: o.stagger ?? 0.045, delay: o.delay ?? 0,
      rise: o.rise ?? 0, face: o.face ?? 0.85, angle: o.angle ?? ((o.size ?? 0.6) < 0.45 ? 0.08 : 0.22), shake: o.shake ?? 0, shadow: o.shadow ?? true, enter: o.enter ?? 'pop',
      follow: o.follow, onLand: o.onLand,
    };
    this.riseV = this.o.rise;
    this.pos.set(x, y, z);
    const lines = text.split('\n');
    const cap = glyphMask('H', st.font);
    let capPx = 0;
    for (let yy = 0; yy < cap.h; yy++) for (let xx = 0; xx < cap.w; xx++) if (cap.m[yy * cap.w + xx] === 1 || cap.m[yy * cap.w + xx] === 2) { capPx = Math.max(capPx, yy); break; }
    this.vox = this.o.size / Math.max(5, capPx);
    const mat = material(st);
    let idx = 0, maxW = 0;
    const lh = cap.h + 2;
    lines.forEach((line, li) => {
      const lw = measure(line, st.font);
      maxW = Math.max(maxW, lw);
      const chars = [...line];
      let pre = '';
      for (const ch of chars) {
        const x0 = measure(pre, st.font);
        pre += ch;
        const g = glyphGeo(ch, st);
        if (!g.geo) continue;
        const mesh = new THREE.Mesh(g.geo, mat);
        mesh.castShadow = this.o.shadow;
        mesh.receiveShadow = false;
        const drop = new THREE.Mesh(g.geo, shadowMat);
        drop.position.set(1.1, -1.1, -(st.depth ?? 5) * 0.9);
        drop.renderOrder = -1;
        mesh.add(drop);
        // glyph canvases start one pixel left of the pen (the outline)
        mesh.position.set((x0 - 1 + g.w / 2 - lw / 2) * this.vox, ((lines.length - 1 - li) * lh - (cap.h - capPx - 1)) * this.vox, 0);
        mesh.scale.setScalar(this.vox);
        this.inner.add(mesh);
        this.letters.push({ mesh, i: idx++, sy: 0, vy: 0, landed: false, base: mesh.position.y, ry: 0, vry: 0 });
      }
    });
    this.width = maxW * this.vox;
    // centre the block vertically on the anchor
    this.inner.position.y = -((lines.length - 1) * lh * this.vox) / 2 - this.o.size / 2;
    this.group.add(this.inner);
    this.group.position.copy(this.pos);
    for (const L of this.letters) { L.mesh.scale.set(0.0001, 0.0001, 0.0001); L.mesh.visible = false; }
    if (this.o.enter === 'slam') for (const L of this.letters) L.vy = 0;
  }

  get alive() { return !this.dead; }
  get out() { return this.outT >= 0; }
  /** pop out now (or after `after` seconds) */
  hide(after = 0) { if (this.outT < 0) this.outT = this.t + after; }
  /** retime its life */
  setLife(sec: number) { this.o.life = this.t + sec; }

  update(dt: number, cam: THREE.Camera) {
    this.t += dt;
    const o = this.o;
    if (o.life > 0 && this.t >= o.life && this.outT < 0) this.outT = this.t;
    if (this.riseV) { this.pos.y += this.riseV * dt; this.riseV *= Math.exp(-dt * 2.2); }
    const f = o.follow?.();
    const gx = this.pos.x + (f?.x ?? 0), gy = this.pos.y + (f?.y ?? 0), gz = this.pos.z + (f?.z ?? 0);
    this.group.position.set(gx, gy, gz);
    // turn toward the camera, keeping a slight angle so the extrusion shows
    const cp = cam.position;
    const want = Math.atan2(cp.x - gx, cp.z - gz) * o.face + o.angle;
    this.yaw += (want - this.yaw) * (1 - Math.exp(-dt * 6));
    const pitch = -Math.atan2(cp.y - gy, Math.hypot(cp.x - gx, cp.z - gz)) * 0.35 * o.face;
    this.group.rotation.set(-pitch * 0.5, this.yaw, Math.sin(this.t * 0.9) * 0.02, 'YXZ');
    // legibility floor: the world renders at ~TEXT3D_VIEW.lowResH px tall, so a glyph pixel must cover at least
    // TEXT3D_VIEW.minPx of those or letters alias into mush; small words grow (up to 2x) until it does
    const pc = cam as THREE.PerspectiveCamera;
    if (pc.isPerspectiveCamera) {
      const dist = Math.max(0.1, Math.hypot(cp.x - gx, cp.y - gy, cp.z - gz));
      const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(pc.fov) / 2)) / TEXT3D_VIEW.lowResH;
      const need = (TEXT3D_VIEW.minPx * worldPerPx) / this.vox;
      this.group.scale.setScalar(Math.min(2, Math.max(1, need)));
    }
    let allGone = this.outT >= 0;
    const n = this.letters.length;
    for (const L of this.letters) {
      const m = L.mesh;
      const li = this.t - o.delay - L.i * o.stagger;
      if (li < 0) { m.visible = false; allGone = false; continue; }
      m.visible = true;
      let sy: number, drop = 0;
      if (this.outT >= 0 && this.t - this.outT - (n - 1 - L.i) * o.stagger * 0.5 > 0) {
        // out: a little hop up, then squash flat and vanish
        const k = Math.min(1, (this.t - this.outT - (n - 1 - L.i) * o.stagger * 0.5) / 0.28);
        sy = (1 + Math.sin(k * Math.PI) * 0.35) * (1 - k * k);
        drop = Math.sin(k * Math.PI) * 0.25;
        if (k < 1) allGone = false;
      } else {
        allGone = false;
        // in: a spring on the letter's height; width keeps the volume (squash & stretch for free)
        if (!L.landed && L.sy === 0 && L.vy === 0) {
          L.vy = o.enter === 'slam' ? 0 : o.enter === 'drop' ? 4 : 16; L.sy = o.enter === 'slam' ? 1.6 : 0.02;
          // each letter flips in from a quarter turn and settles on a spring (alternating sides, a little overshoot)
          L.ry = o.enter === 'slam' ? 0 : (L.i % 2 ? -1 : 1) * 1.1; L.vry = 0;
        }
        const kk = o.enter === 'slam' ? 260 : 170, c = o.enter === 'slam' ? 11 : 9;
        L.vy += (-(L.sy - 1) * kk - L.vy * c) * dt;
        L.sy += L.vy * dt;
        L.vry += (-L.ry * 140 - L.vry * 9) * dt; L.ry += L.vry * dt;
        if (!L.landed && li > 0.12) { L.landed = true; o.onLand?.(L.i); }
        sy = Math.max(0.02, L.sy);
        // drop: falls in and bounces twice; slam: a heavy fall with one hard bounce
        const bounce = (k: number) => { const t2 = 1 - k; return Math.abs(Math.cos(t2 * Math.PI * 1.5)) * t2 * t2; };
        if (o.enter === 'drop') drop = li < 0.45 ? bounce(Math.min(1, li / 0.45)) * 1.4 : 0;
        if (o.enter === 'slam') drop = Math.max(0, 1 - li / 0.12) * 2.5;
      }
      const sx = 1 / Math.sqrt(Math.max(0.3, sy));
      const bob = Math.sin(this.t * 2.2 - L.i * o.wave) * o.bob * o.size;
      const sh = o.shake ? (Math.random() - 0.5) * o.shake * o.size * 0.12 : 0;
      m.scale.set(this.vox * sx * Math.min(1, sy * 3), this.vox * sy, this.vox * sx * Math.min(1, sy * 3));
      m.position.y = L.base + bob + drop * o.size + sh;
      m.rotation.z = Math.sin(this.t * 1.7 - L.i * 0.8) * 0.05 + (o.shake ? (Math.random() - 0.5) * o.shake * 0.08 : 0);
      m.rotation.y = this.outT >= 0 ? 0 : L.ry;
    }
    if (allGone && this.outT >= 0) { this.dead = true; this.group.visible = false; }
  }

  dispose() { this.group.removeFromParent(); }
}

// ------------------------------------------------------------------ the layer
export class Text3DLayer {
  group = new THREE.Group();
  items: Text3D[] = [];
  constructor() { this.group.name = 'text3d'; }

  add(text: string, x: number, y: number, z: number, st: T3DStyle, o: T3DOpts = {}): Text3D {
    const t = new Text3D(text, st, x, y, z, o);
    this.items.push(t);
    this.group.add(t.group);
    if (this.items.length > 48) { const old = this.items.shift()!; old.dispose(); }
    return t;
  }

  /** a damage number: rises, faces the camera square on, pops out (crits: bigger, gold, shaking) */
  damage(n: number, x: number, y: number, crit = false, heal = false): Text3D {
    const s = n >= 10 ? String(Math.round(n)) : String(+n.toFixed(1));
    return this.add((heal ? '+' : '') + s + (crit ? '!' : ''), x + (Math.random() - 0.5) * 0.3, y, 0.9, heal ? T3D.heal : crit ? T3D.crit : T3D.damage, {
      size: crit ? 0.62 : 0.4, life: crit ? 1.3 : 0.9, rise: crit ? 1.6 : 1.3, face: 1, angle: 0, bob: 0, stagger: 0.02, shake: crit ? 0.6 : 0, shadow: true,
    });
  }

  update(dt: number, cam: THREE.Camera) {
    for (const t of this.items) t.update(dt, cam);
    for (let i = this.items.length - 1; i >= 0; i--) if (this.items[i].dead) { this.items[i].dispose(); this.items.splice(i, 1); }
  }

  clear() { for (const t of this.items) t.dispose(); this.items.length = 0; }
}

// ------------------------------------------------------------------ FloatText that sends the big pops to 3D
const ROUTE: Partial<Record<StyleName, T3DStyle>> = { title: T3D.title, item: T3D.item, gold: T3D.gold, danger: T3D.danger, damage: T3D.damage, magic: T3D.magic };

/**
 * a FloatText for World.text: titles, item names, big gold / danger call-outs (WAVE n, WAVE CLEARED, NETTED!),
 * CRIT! and damage numbers become lit 3D words in `layer`; small hints and barks stay crisp flat sprites.
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
