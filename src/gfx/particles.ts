// Particles: hand-painted pixel sprites (bubbles, sparkles, snow, droplets, goo, ink, stars) on GPU points,
// plus tumbling voxel debris (instanced cubes) for rock chunks, coral bits and wood splinters.
//
//   fx.emit('bubble', x, y, { n: 6, spread: 0.2, vy: 1 })
//   fx.burst('spark', x, y, 12, 4)           // n particles, speed
//   fx.debris(x, y, 10, '#8a7f73', 3)         // voxel chunks
//   fx.splash(x, strength)                    // surface splash: droplets above, bubbles below
// Particles above the water obey gravity; below they get buoyancy + drag; bubbles pop at the surface.
import * as THREE from 'three';
import { Px, hex, mix, RGB } from './px';
import { clamp01 } from '../core/math';

export type PKind = 'bubble' | 'bubbleBig' | 'snow' | 'spark' | 'star' | 'droplet' | 'goo' | 'ink' | 'dust' | 'glow' | 'heart' | 'coin' | 'ember' | 'ring' | 'leaf' | 'zap';
const SPRITES: PKind[] = ['bubble', 'bubbleBig', 'snow', 'spark', 'star', 'droplet', 'goo', 'ink', 'dust', 'glow', 'heart', 'coin', 'ember', 'ring', 'leaf', 'zap'];
const CELL = 16, COLS = 4;

function paintAtlas(): THREE.Texture {
  const p = new Px(CELL * COLS, CELL * COLS);
  const at = (k: PKind) => { const i = SPRITES.indexOf(k); return [(i % COLS) * CELL, Math.floor(i / COLS) * CELL]; };
  const disc = (k: PKind, r: number, fn: (nx: number, ny: number) => RGB | null) => { const [ox, oy] = at(k); p.ellipse(ox + 8, oy + 8, r, r, (nx, ny) => fn(nx, ny)); };
  // bubble: thin bright rim, faint body, highlight top-left
  let [ox, oy] = at('bubble');
  p.ellipse(ox + 8, oy + 8, 5.5, 5.5, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.72 ? [200, 250, 255] : null; });
  p.ellipse(ox + 8, oy + 8, 4.5, 4.5, () => [120, 210, 240], 70);
  p.set(ox + 6, oy + 5, '#ffffff'); p.set(ox + 5, oy + 6, '#ffffff'); p.set(ox + 6, oy + 6, '#e8ffff');
  [ox, oy] = at('bubbleBig');
  p.ellipse(ox + 8, oy + 8, 7.5, 7.5, (nx, ny) => { const d = Math.hypot(nx, ny); return d > 0.82 ? [210, 250, 255] : null; });
  p.ellipse(ox + 8, oy + 8, 6.5, 6.5, (nx, ny) => mix([90, 190, 230], [170, 235, 255], clamp01(-ny * 0.5 + 0.3)), 60);
  p.rect(ox + 4, oy + 4, 2, 1, '#ffffff'); p.rect(ox + 4, oy + 5, 1, 2, '#ffffff'); p.set(ox + 11, oy + 11, '#c8f4ff');
  disc('snow', 2.2, () => [235, 245, 240]);
  [ox, oy] = at('spark');
  for (let i = -5; i <= 5; i++) { const a = 255 * (1 - Math.abs(i) / 6); p.set(ox + 8 + i, oy + 8, '#fff6d0', a); p.set(ox + 8, oy + 8 + i, '#fff6d0', a); }
  p.rect(ox + 7, oy + 7, 2, 2, '#ffffff');
  [ox, oy] = at('star');
  p.poly([[8, 1], [10, 6], [15, 6], [11, 9], [13, 15], [8, 11], [3, 15], [5, 9], [1, 6], [6, 6]].map(([x, y]) => [ox + x, oy + y] as [number, number]), (x, y) => mix(hex('#fff3a0'), hex('#ffb830'), (y - oy) / 16));
  p.set(ox + 7, oy + 5, '#ffffff');
  disc('droplet', 3, (nx, ny) => mix([200, 245, 255], [90, 190, 230], clamp01(ny * 0.5 + 0.5)));
  disc('goo', 4, (nx, ny) => (nx < -0.2 && ny < -0.2 ? [255, 220, 230] : mix([250, 160, 180], [200, 100, 130], clamp01(ny * 0.5 + 0.5))));
  disc('ink', 7, (nx, ny) => { const d = Math.hypot(nx, ny); return d < 0.9 ? mix([40, 30, 60], [20, 15, 35], d) : null; });
  disc('dust', 2.5, () => [170, 150, 120]);
  [ox, oy] = at('glow');
  p.ellipse(ox + 8, oy + 8, 7.5, 7.5, (nx, ny) => { const d = Math.hypot(nx, ny); return [255, 255, 255]; });
  p.map((c, x, y) => { if (x < ox || x >= ox + CELL || y < oy || y >= oy + CELL) return null; const d = Math.hypot(x + 0.5 - ox - 8, y + 0.5 - oy - 8) / 8; return [255, 255, 255, Math.max(0, (1 - d) ** 2) * 255]; });
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
  const t = p.texture({ mip: false });
  return t;
}

interface P { k: number; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; size1: number; rot: number; vr: number; col: THREE.Color; alpha: number; add: boolean; grav: number; drag: number; wob: number; seed: number }

export interface EmitOpts { n?: number; spread?: number; vx?: number; vy?: number; speed?: number; life?: number; size?: number; size1?: number; color?: string | THREE.Color; alpha?: number; add?: boolean; z?: number; grav?: number; drag?: number }

const MAX = 6000;

export class Particles {
  points: THREE.Points;
  pointsAdd: THREE.Points;
  private geoAdd: THREE.BufferGeometry;
  private ps: P[] = [];
  private geo: THREE.BufferGeometry;
  private aPos: Float32Array; private aCol: Float32Array; private aMisc: Float32Array;
  private debrisMesh: THREE.InstancedMesh;
  private debris: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; vrx: number; vry: number; s: number; life: number; col: THREE.Color }[] = [];
  waterAt: (x: number) => number = () => 0;
  onSurfacePop?: (x: number, s: number) => void;
  floorAt: (x: number) => number = () => -1e9;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.aPos = new Float32Array(MAX * 3); this.aCol = new Float32Array(MAX * 4); this.aMisc = new Float32Array(MAX * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.aCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aMisc', new THREE.BufferAttribute(this.aMisc, 4).setUsage(THREE.DynamicDrawUsage));
    const VS = /* glsl */ `
        attribute vec4 aCol; attribute vec4 aMisc; // misc: sprite, size, rot, additive
        uniform float uScale; varying vec4 vCol; varying float vSprite; varying float vRot;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, aMisc.y * uScale / -mv.z);
          vCol = aCol; vSprite = aMisc.x; vRot = aMisc.z;
        }`;
    const FS = (additive: boolean) => /* glsl */ `
        uniform sampler2D uAtlas; varying vec4 vCol; varying float vSprite; varying float vRot;
        void main() {
          vec2 pc = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          pc = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y) + 0.5;
          if (pc.x < 0.0 || pc.y < 0.0 || pc.x > 1.0 || pc.y > 1.0) discard;
          float col = mod(vSprite, 4.0), row = floor(vSprite / 4.0);
          vec2 uv = (vec2(col, row) + pc) / 4.0;
          uv.y = 1.0 - uv.y;
          vec4 t = texture2D(uAtlas, uv);
          float a = t.a * vCol.a;
          ${additive ? 'if (a < 0.01) discard; gl_FragColor = vec4(t.rgb * vCol.rgb * a * 1.6, 1.0);' : 'if (t.a < 0.5 || vCol.a < 0.04) discard; gl_FragColor = vec4(t.rgb * vCol.rgb, 1.0);'}
        }`;
    const uniforms = { uAtlas: { value: paintAtlas() }, uScale: { value: 600 } };
    // hard-edged pixel sprites write depth (so the water fog treats them like the solid things they are);
    // glows are additive and depth-free
    const matHard = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS(false) });
    const matAdd = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS(true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.geoAdd = new THREE.BufferGeometry();
    for (const k of ['position', 'aCol', 'aMisc']) this.geoAdd.setAttribute(k, this.geo.getAttribute(k));
    this.points = new THREE.Points(this.geo, matHard);
    this.pointsAdd = new THREE.Points(this.geoAdd, matAdd);
    this.pointsAdd.frustumCulled = false;
    this.pointsAdd.renderOrder = 21;
    this.points.frustumCulled = false;
    this.points.renderOrder = 20;
    this.points.name = 'particles';

    const box = new THREE.BoxGeometry(1, 1, 1);
    const dm = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });
    this.debrisMesh = new THREE.InstancedMesh(box, dm, 600);
    this.debrisMesh.count = 0;
    this.debrisMesh.castShadow = true;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(600 * 3), 3);
  }

  get object() { const g = new THREE.Group(); g.add(this.points, this.pointsAdd, this.debrisMesh); return g; }
  get count() { return this.ps.length; }

  emit(kind: PKind, x: number, y: number, o: EmitOpts = {}) {
    const n = o.n ?? 1;
    for (let i = 0; i < n; i++) {
      if (this.ps.length >= MAX) this.ps.shift();
      const sp = o.spread ?? 0.1;
      const ang = Math.random() * Math.PI * 2, spd = (o.speed ?? 0) * (0.4 + Math.random() * 0.6);
      const k = SPRITES.indexOf(kind);
      const life = (o.life ?? defLife(kind)) * (0.7 + Math.random() * 0.6);
      const size = (o.size ?? defSize(kind)) * (0.7 + Math.random() * 0.6);
      this.ps.push({
        k, x: x + (Math.random() - 0.5) * sp * 2, y: y + (Math.random() - 0.5) * sp * 2, z: (o.z ?? 0) + (Math.random() - 0.5) * sp,
        vx: (o.vx ?? 0) + Math.cos(ang) * spd, vy: (o.vy ?? defVy(kind)) + Math.sin(ang) * spd, vz: (Math.random() - 0.5) * spd * 0.5,
        life, max: life, size, size1: o.size1 ?? size, rot: Math.random() * Math.PI * 2, vr: (Math.random() - 0.5) * 4,
        col: new THREE.Color(o.color ?? '#ffffff'), alpha: o.alpha ?? 1, add: o.add ?? (kind === 'spark' || kind === 'glow' || kind === 'star' || kind === 'zap' || kind === 'ember'),
        grav: o.grav ?? defGrav(kind), drag: o.drag ?? 1.6, wob: kind.startsWith('bubble') ? 1 : 0, seed: Math.random() * 100,
      });
    }
  }
  burst(kind: PKind, x: number, y: number, n: number, speed: number, o: EmitOpts = {}) { this.emit(kind, x, y, { ...o, n, speed, vy: o.vy ?? 0 }); }

  debrisBurst(x: number, y: number, n: number, color: string | THREE.Color, speed = 3, size = 0.09, z = 0) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= 600) this.debris.shift();
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      const cc = c.clone().multiplyScalar(0.75 + Math.random() * 0.45);
      this.debris.push({ x, y, z: z + (Math.random() - 0.5) * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, vz: (Math.random() - 0.5) * s * 0.5, rx: Math.random() * 6, ry: Math.random() * 6, vrx: (Math.random() - 0.5) * 14, vry: (Math.random() - 0.5) * 14, s: size * (0.5 + Math.random()), life: 2.5 + Math.random() * 2, col: cc });
    }
  }

  /** a surface splash at x: droplets fly up, bubbles get dragged down */
  splash(x: number, strength = 1, y = this.waterAt(x)) {
    const s = Math.min(3, strength);
    this.emit('droplet', x, y + 0.05, { n: Math.round(6 + s * 10), spread: 0.25 * s, vy: 2.5 + s * 1.6, speed: 1.6 + s, life: 1.0, size: 0.09, grav: -9.8, drag: 0.3 });
    this.emit('bubble', x, y - 0.25, { n: Math.round(4 + s * 8), spread: 0.4 * s, vy: -0.5 - s * 0.6, speed: 0.6 + s * 0.4, life: 2.2, size: 0.12 });
    this.emit('ring', x, y, { n: 1, size: 0.3 + s * 0.4, size1: 1.2 + s * 1.2, life: 0.5, alpha: 0.6, add: true, vy: 0, grav: 0 });
  }

  update(dt: number) {
    const ps = this.ps;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      const surf = this.waterAt(p.x);
      const under = p.y < surf;
      if (p.wob) {
        // bubbles: buoyancy rises them, they wobble side to side and pop at the surface
        p.vy += (under ? 3.2 : -9.8) * dt;
        p.vx += Math.sin(p.life * 7 + p.seed) * 1.6 * dt;
        p.size *= 1 + dt * 0.05;
        if (under && p.y > surf - 0.06 && p.vy > 0) { p.life = 0; this.onSurfacePop?.(p.x, p.size); continue; }
      } else {
        p.vy += (under ? p.grav * 0.15 : p.grav === 0 ? 0 : -9.8) * dt;
      }
      const dr = Math.exp(-(under ? p.drag : 0.2) * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      if (p.y < this.floorAt(p.x) && !p.wob) { p.y = this.floorAt(p.x); p.vy *= -0.2; p.vx *= 0.5; }
      ps[w++] = p;
    }
    ps.length = w;
    const n = Math.min(ps.length, MAX);
    let wi = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        const p = ps[i];
        if (p.add !== (pass === 1)) continue;
        const t = 1 - p.life / p.max;
        this.aPos[wi * 3] = p.x; this.aPos[wi * 3 + 1] = p.y; this.aPos[wi * 3 + 2] = p.z;
        const fadeIn = clamp01((p.max - p.life) / 0.08), fadeOut = clamp01(p.life / Math.min(0.4, p.max * 0.5));
        this.aCol[wi * 4] = p.col.r; this.aCol[wi * 4 + 1] = p.col.g; this.aCol[wi * 4 + 2] = p.col.b; this.aCol[wi * 4 + 3] = p.alpha * fadeIn * fadeOut;
        this.aMisc[wi * 4] = p.k; this.aMisc[wi * 4 + 1] = p.size + (p.size1 - p.size) * t; this.aMisc[wi * 4 + 2] = p.k === 0 || p.k === 1 ? 0 : p.rot; this.aMisc[wi * 4 + 3] = p.add ? 1 : 0;
        wi++;
      }
      if (pass === 0) this.geo.setDrawRange(0, wi);
      else this.geoAdd.setDrawRange(this.geo.drawRange.count, wi - this.geo.drawRange.count);
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aCol as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aMisc as THREE.BufferAttribute).needsUpdate = true;

    // voxel debris
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sv = new THREE.Vector3(), pv = new THREE.Vector3();
    let dn = 0;
    for (const d of this.debris) {
      d.life -= dt;
      if (d.life <= 0) continue;
      const under = d.y < this.waterAt(d.x);
      d.vy += (under ? -2.2 : -9.8) * dt;
      const dr = Math.exp(-(under ? 1.8 : 0.1) * dt);
      d.vx *= dr; d.vy *= dr; d.vz *= dr;
      d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
      const fl = this.floorAt(d.x);
      if (d.y - d.s * 0.5 < fl) { d.y = fl + d.s * 0.5; d.vy = Math.abs(d.vy) * 0.3; d.vx *= 0.6; d.vrx *= 0.5; d.vry *= 0.5; }
      d.rx += d.vrx * dt; d.ry += d.vry * dt;
      const s = d.s * clamp01(d.life / 0.5);
      m.compose(pv.set(d.x, d.y, d.z), q.setFromEuler(e.set(d.rx, d.ry, 0)), sv.set(s, s, s));
      this.debrisMesh.setMatrixAt(dn, m);
      this.debrisMesh.setColorAt(dn, d.col);
      dn++;
    }
    this.debris = this.debris.filter((d) => d.life > 0);
    this.debrisMesh.count = dn;
    this.debrisMesh.instanceMatrix.needsUpdate = true;
    if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  setPixelScale(h: number, fovDeg: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
  clear() { this.ps.length = 0; this.debris.length = 0; }
}

function defLife(k: PKind) { return k === 'snow' ? 8 : k.startsWith('bubble') ? 3 : k === 'ink' ? 2.5 : k === 'spark' ? 0.35 : k === 'glow' ? 0.5 : 1.2; }
function defSize(k: PKind) { return k === 'snow' ? 0.04 : k === 'bubble' ? 0.14 : k === 'bubbleBig' ? 0.3 : k === 'spark' ? 0.25 : k === 'ink' ? 0.9 : k === 'glow' ? 0.6 : 0.2; }
function defVy(k: PKind) { return k.startsWith('bubble') ? 0.4 : 0; }
function defGrav(k: PKind) { return k === 'droplet' || k === 'goo' || k === 'coin' ? -9.8 : k === 'dust' ? -0.3 : 0; }
