// Particles: hand-designed 2D PIXEL-ART sprites (src/gfx/fxsprites.ts: animated 3-8 frame strips, limited palettes,
// hard edges) on GPU points, plus tumbling low-poly 3D chunks (rock / coral / wood debris and textured flesh gibs).
//
// ---- basics (v1, unchanged)
//   fx.emit('bubble', x, y, { n: 6, spread: 0.2, vy: 1 })       any sprite kind (PKind), see EmitOpts
//   fx.burst('spark', x, y, 12, 4)                              n particles, speed
//   fx.debrisBurst(x, y, 10, '#8a7f73', 3)                      low-poly chunks
//   fx.splash(x, strength)                                      surface splash: crown + droplets above, bubbles below
// ---- ambient (call once per scene / area; spawns around the camera automatically)
//   fx.ambient('reef')            marine snow in 3 parallax depth layers, plankton motes, light glints in the
//                                 god rays (look ids: reef kelp graveyard arctic abyss harbor sunset; null = off;
//                                 or an AmbientCfg object)
//   const id = fx.vent(x, y, 3)   a bubble stream (vents, plants, wrecks); fx.removeVent(id)
//   fx.touch(x, y, k)             sand puff where something touches the floor (debris / gibs do it themselves)
//   fx.glint(x, y)                a fish-scale / metal flash
// ---- gameplay
//   fx.wake(x, y, dir, speed)     swim-wake bubbles from a tail (dir = travel direction, radians or {x, y})
//   fx.hit(x, y, kind, dir)       impact: 'hit' | 'crit' | 'block' | 'slash' | 'frost' | 'zap' | 'poison' | 'ink' |
//                                 'magic' | 'fire' (+ optional colour)
//   fx.slash(x, y, angle, size)   a pixel slash arc
//   fx.pickup(x, y, colour)       sparkle burst for a pickup;  fx.coins(x, y, n)  coin pop;  fx.heal(x, y, n) hearts
//   fx.runes / fx.frost / fx.zaps / fx.poison / fx.inkCloud (x, y, n)   elemental flavours
//   fx.gore(x, y, amount, dir)    blood clouds that bloom and drift underwater / droplets in air, gib sprites,
//                                 textured 3D gibs that bleed as they sink;  fx.bleed(x, y, k)  a wisp from a wound
//   fx.silt / fx.smoke (x, y, n)  sand clouds / smoke puffs
//   fx.explosion(x, y, size)      flash light, fireball (or gas bubble underwater), shockwave, sparks, smoke, debris
//   fx.magic(x, y, colour, n)  fx.sparks(x, y, n, dir)  fx.muzzle(x, y, angle, size)  fx.shockwave(x, y, size)
//   fx.light(x, y, colour, intensity, dur)   a point-light flash via the scene's Lighting rig
//
// Rendering: sprites are sized in the low internal resolution (src/gfx/post.ts) and sampled nearest, so they stay
// crisp pixel art. "Hard" sprites are alpha cut-outs that write depth (the water fog treats them like solids);
// glows / sparks / magic are additive. Non-glowing sprites dim with water depth like lit surfaces. Above the water
// particles obey gravity; below they get buoyancy + drag; bubbles pop at the surface; blood drops that fall into
// the water bloom into clouds.
import * as THREE from 'three';
import { clamp01, hash2 } from '../core/math';
import { UW, uw } from './shaders/underwater';
import { RETRO } from './retro';
import { rigOf, type Lighting } from './lighting';
import { tex } from './tex';
import { DEFS, atlas, type PKind, type SpriteDef, type Atlas } from './fxsprites';

export type { PKind };

/** the shared particle sprite atlas texture (512 px, nearest), e.g. for previews or UI reuse */
export function particleAtlas(): THREE.Texture { return atlas().tex; }

interface Part {
  k: PKind; d: SpriteDef; x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; delay: number;
  size: number; size1: number; rot: number; vr: number; col: THREE.Color; alpha: number; add: boolean; grav: number; drag: number;
  wob: number; seed: number; frame: number; drift: number; under: boolean; emit: boolean; puff: boolean;
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
  /** puff sand when it lands on the floor */
  puff?: boolean;
}

/** ambient particle settings (fx.ambient) */
export interface AmbientCfg {
  /** marine snow flecks per depth layer in view (near, mid, far) */
  snow?: [number, number, number];
  /** plankton motes in view */
  motes?: number;
  /** light glints per second in the upper water */
  glints?: number;
  snowCol?: string; moteCol?: string;
}
const AMBIENT: Record<string, AmbientCfg> = {
  reef: { snow: [14, 26, 40], motes: 10, glints: 3, snowCol: '#e8eee4', moteCol: '#c8f0b0' },
  kelp: { snow: [16, 30, 46], motes: 18, glints: 4, snowCol: '#e0ead0', moteCol: '#b8f0a0' },
  graveyard: { snow: [22, 40, 60], motes: 6, glints: 1, snowCol: '#d4d8d0', moteCol: '#c0d0c0' },
  arctic: { snow: [26, 44, 64], motes: 4, glints: 4, snowCol: '#ffffff', moteCol: '#e0f4ff' },
  abyss: { snow: [18, 34, 50], motes: 14, glints: 0, snowCol: '#a8b4c8', moteCol: '#7ad8ff' },
  harbor: { snow: [18, 30, 44], motes: 8, glints: 2, snowCol: '#dcdcd0', moteCol: '#c8e0b0' },
  sunset: { snow: [14, 24, 36], motes: 10, glints: 4, snowCol: '#f0e4d8', moteCol: '#f0e0b0' },
};
const LAYERS_Z = [1.6, -3.5, -14];

const MAX = 6000;
const MAX_GIBS = 160;
const MAX_DEBRIS = 600;

interface Chunk { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; vrx: number; vry: number; s: number; sx: number; sy: number; sz: number; life: number; col: THREE.Color; bleed: number; acc: number; landed: boolean }

export type HitKind = 'hit' | 'crit' | 'block' | 'slash' | 'frost' | 'zap' | 'poison' | 'ink' | 'magic' | 'fire';
type Dir = number | { x: number; y: number };
const angOf = (d: Dir | undefined, fallback = 0) => (d === undefined ? fallback : typeof d === 'number' ? d : Math.atan2(d.y, d.x));

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
  private cam: THREE.PerspectiveCamera | null = null;
  private amb: AmbientCfg | null = null;
  private ambAcc = [0, 0, 0, 0, 0];
  private ambPrimed = false;
  private vents = new Map<number, { x: number; y: number; z: number; rate: number; acc: number }>();
  private ventId = 1;
  waterAt: (x: number) => number = () => 0;
  onSurfacePop?: (x: number, s: number) => void;
  floorAt: (x: number) => number = () => -1e9;
  /** underwater current (m/s) that drifting particles (blood, silt, smoke, snow) are carried by */
  current = new THREE.Vector2(0.12, 0.02);
  /** set to route light flashes somewhere specific (default: the Lighting rig found in the same scene) */
  onFlash?: (x: number, y: number, color: string, intensity: number, dur: number) => void;

  constructor() {
    this.atlas = atlas();
    this.geo = new THREE.BufferGeometry();
    this.aPos = new Float32Array(MAX * 3); this.aCol = new Float32Array(MAX * 4); this.aMisc = new Float32Array(MAX * 4); this.aRect = new Float32Array(MAX * 4);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aCol', new THREE.BufferAttribute(this.aCol, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aMisc', new THREE.BufferAttribute(this.aMisc, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aRect', new THREE.BufferAttribute(this.aRect, 4).setUsage(THREE.DynamicDrawUsage));
    const VS = /* glsl */ `
        attribute vec4 aCol; attribute vec4 aMisc; attribute vec4 aRect; // misc: size, rot, flags, seed
        uniform float uScale; uniform vec2 uViewRes; uniform float uWaterY; uniform vec3 uDepthExt; uniform vec3 uDepthMin;
        varying vec4 vCol; varying vec4 vRect; varying float vRot; varying float vFlags; varying vec3 vLight;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          float sc = uViewRes.y > 0.0 ? projectionMatrix[1][1] * 0.5 * uViewRes.y : uScale;
          gl_PointSize = max(1.0, floor(aMisc.x * sc / -mv.z + 0.5));
          vCol = aCol; vRect = aRect; vRot = aMisc.y; vFlags = aMisc.z;
          float depth = max(0.0, uWaterY - wp.y);
          vLight = mod(floor(aMisc.z / 2.0), 2.0) > 0.5 ? vec3(1.0) : mix(vec3(1.0), max(exp(-uDepthExt * depth), uDepthMin), 0.8);
        }`;
    const FS = (additive: boolean) => /* glsl */ `
        uniform sampler2D uAtlas; varying vec4 vCol; varying vec4 vRect; varying float vRot; varying float vFlags; varying vec3 vLight;
        void main() {
          vec2 pc = gl_PointCoord - 0.5;
          float c = cos(vRot), s = sin(vRot);
          pc = vec2(c * pc.x - s * pc.y, s * pc.x + c * pc.y) + 0.5;
          if (pc.x < 0.0 || pc.y < 0.0 || pc.x > 1.0 || pc.y > 1.0) discard;
          vec2 uv = vec2(vRect.x + pc.x * vRect.z, 1.0 - (vRect.y + pc.y * vRect.w));
          vec4 t = texture2D(uAtlas, uv);
          float a = t.a * vCol.a;
          vec3 rgb = t.rgb * vCol.rgb * vLight;
          if (mod(vFlags, 2.0) > 0.5) { float l = dot(t.rgb, vec3(0.3, 0.55, 0.15)); rgb *= 1.0 + 3.0 * l * l * l; }
          ${additive
            ? 'if (a < 0.02) discard; gl_FragColor = vec4(rgb * a * 1.4, 1.0);'
            : 'if (a < 0.5) discard; gl_FragColor = vec4(rgb, 1.0);'}
        }`;
    const uniforms = {
      uAtlas: { value: this.atlas.tex }, uScale: { value: 600 }, uViewRes: RETRO.uRes,
      uWaterY: UW.uWaterY, uDepthExt: UW.uDepthExt, uDepthMin: UW.uDepthMin,
    };
    // hard-edged pixel sprites are alpha cut-outs that write depth; glows are additive and depth-free
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
    // remember the camera that draws us (ambient particles spawn around it)
    this.points.onBeforeRender = (_r, _s, cam) => { if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) this.cam = cam as THREE.PerspectiveCamera; };

    // low-poly chunks: faceted rock / coral / wood bits with a neutral chip texture tinted per instance
    const grit = tex('grit', { size: 32 });
    const chunkGeo = new THREE.IcosahedronGeometry(0.62, 0);
    const dm = uw(new THREE.MeshStandardMaterial({ map: grit.map, normalMap: grit.normal, roughness: 0.9, metalness: 0 }), { caustics: 0.6 });
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
    const pa = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) { const k = 0.75 + hash2(Math.round(pa.getX(i) * 9), Math.round(pa.getY(i) * 9) + Math.round(pa.getZ(i) * 9) * 7, 5) * 0.45; pa.setXYZ(i, pa.getX(i) * k, pa.getY(i) * k, pa.getZ(i) * k); }
    g.computeVertexNormals();
    const m = uw(new THREE.MeshStandardMaterial({ map: fl.map, normalMap: fl.normal, roughness: 0.8, metalness: 0 }), { sss: [0.9, 0.15, 0.1], sssK: 0.4 });
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
      const size = (o.size ?? d.size) * (0.8 + Math.random() * 0.4);
      const col = new THREE.Color(o.color ?? '#ffffff');
      if (o.bright) col.multiplyScalar(o.bright);
      const rot = o.rot ?? (d.rot === 'random' ? Math.random() * Math.PI * 2 : d.rot === 'quarter' ? Math.floor(Math.random() * 4) * Math.PI * 0.5 : 0);
      const px = x + (Math.random() - 0.5) * sp * 2, py = y + (Math.random() - 0.5) * sp * 2;
      this.ps.push({
        k: d === DEFS.glow && kind !== 'glow' ? 'glow' : kind, d, x: px, y: py, z: (o.z ?? 0) + (Math.random() - 0.5) * sp,
        vx: (o.vx ?? 0) + Math.cos(ang) * spd, vy: (o.vy ?? d.vy ?? 0) + Math.sin(ang) * spd, vz: (Math.random() - 0.5) * spd * 0.5,
        life, max: life, delay: o.delay ?? 0, size, size1: o.size1 !== undefined ? o.size1 * (size / (o.size ?? d.size)) : size,
        rot, vr: o.vr ?? (d.rot === 'random' ? (Math.random() - 0.5) * 4 : 0),
        col, alpha: o.alpha ?? 1, add: o.add ?? d.add, grav: o.grav ?? d.grav ?? 0, drag: o.drag ?? 1.6,
        wob: kind.startsWith('bubble') || kind === 'poison' ? 1 : 0, seed: Math.random(), frame: d.anim === 'variant' ? Math.floor(Math.random() * d.frames) : 0,
        drift: o.drift ?? 0, under: py < this.waterAt(px), emit: !!d.emit, puff: !!o.puff,
      });
    }
  }
  burst(kind: PKind, x: number, y: number, n: number, speed: number, o: EmitOpts = {}) { this.emit(kind, x, y, { ...o, n, speed, vy: o.vy ?? 0 }); }

  /** low-poly chunks (rock, coral, wood, shell) */
  debrisBurst(x: number, y: number, n: number, color: string | THREE.Color, speed = 3, size = 0.09, z = 0) {
    const c = new THREE.Color(color).multiplyScalar(1.1);
    for (let i = 0; i < n; i++) {
      if (this.debris.length >= MAX_DEBRIS) this.debris.shift();
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      this.debris.push(this.chunk(x, y, z, Math.cos(a) * s, Math.sin(a) * s + 1, size * (0.5 + Math.random()), 2.5 + Math.random() * 2, c.clone().multiplyScalar(0.8 + Math.random() * 0.35), 0));
    }
  }
  private chunk(x: number, y: number, z: number, vx: number, vy: number, s: number, life: number, col: THREE.Color, bleed: number): Chunk {
    return {
      x, y, z: z + (Math.random() - 0.5) * 0.3, vx, vy, vz: (Math.random() - 0.5) * Math.hypot(vx, vy) * 0.4,
      rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, vrx: (Math.random() - 0.5) * 14, vry: (Math.random() - 0.5) * 14,
      s, sx: 0.75 + Math.random() * 0.5, sy: 0.6 + Math.random() * 0.5, sz: 0.75 + Math.random() * 0.5, life, col, bleed, acc: 0, landed: false,
    };
  }

  /** textured low-poly flesh gibs; underwater they sink slowly trailing blood */
  gibs(x: number, y: number, n: number, speed = 4, dir = 0, spreadAng = Math.PI, z = 0) {
    this.ensureGibs();
    for (let i = 0; i < n; i++) {
      if (this.gibList.length >= MAX_GIBS) this.gibList.shift();
      const a = dir + (Math.random() - 0.5) * spreadAng * 2, s = speed * (0.35 + Math.random() * 0.65);
      const k = Math.random();
      const col = new THREE.Color(k < 0.65 ? '#ffffff' : k < 0.85 ? '#a86870' : '#f0d8c0').multiplyScalar(0.85 + Math.random() * 0.3);
      this.gibList.push(this.chunk(x, y, z, Math.cos(a) * s, Math.sin(a) * s + 1.2, 0.05 + Math.random() * 0.09, 5 + Math.random() * 4, col, 1));
    }
  }

  // ------------------------------------------------------------------------------------------------ ambient
  /** ambient life around the camera: a look id ('reef', 'kelp', ...), a config, or null to stop */
  ambient(look: string | AmbientCfg | null = 'reef') {
    this.amb = look === null ? null : typeof look === 'string' ? AMBIENT[look] ?? AMBIENT.reef : { ...AMBIENT.reef, ...look };
    this.ambPrimed = false;
  }
  /** a bubble stream source (vents, plants, wrecks); returns an id for removeVent */
  vent(x: number, y: number, rate = 3, z = 0) { const id = this.ventId++; this.vents.set(id, { x, y, z, rate, acc: 0 }); return id; }
  removeVent(id: number) { this.vents.delete(id); }
  /** a little sand puff where something touches the floor (k ~0.3 tap .. 1 landing .. 2 slam) */
  touch(x: number, y: number, k = 1, z = 0) {
    const n = Math.max(1, Math.round(1 + k * 2.5));
    for (let i = 0; i < n; i++) this.emit('puff', x + (Math.random() - 0.5) * 0.3 * k, y + 0.06, { vx: (Math.random() - 0.5) * 1.2 * k, vy: 0.3 + Math.random() * 0.4 * k, size: (0.3 + Math.random() * 0.25) * (0.7 + k * 0.3), life: 0.5 + k * 0.3, drag: 3, z, color: '#e8e0d0' });
    if (k > 0.7) this.emit('chip', x, y + 0.05, { n: Math.round(k * 2), speed: 1.6 * k, vy: 1.5, grav: -9.8, drag: 1.5, color: '#c8b48c', z });
  }
  /** a fish-scale / metal glint */
  glint(x: number, y: number, n = 1, z = 0.2) { this.emit('glint', x, y, { n, spread: 0.15, z, life: 0.35 }); }

  private spawnAmbient(dt: number) {
    const cam = this.cam, amb = this.amb;
    if (!cam || !amb) return;
    const half = Math.tan((cam.fov * Math.PI) / 360);
    const prime = !this.ambPrimed;
    this.ambPrimed = true;
    const snow = amb.snow ?? [0, 0, 0];
    for (let l = 0; l < 3; l++) {
      const z = LAYERS_Z[l], D = cam.position.z - z;
      if (D <= 0.5) continue;
      const hh = half * D, hw = hh * cam.aspect;
      const life = 7 + l * 2;
      const want = snow[l];
      // spawn rate keeps ~want flecks in view; prime fills the view at once
      this.ambAcc[l] += prime ? want : (want / life) * dt;
      while (this.ambAcc[l] >= 1) {
        this.ambAcc[l] -= 1;
        const x = cam.position.x + (Math.random() * 2 - 1) * hw * 1.1, y = cam.position.y + (Math.random() * 2 - 1) * hh * 1.05;
        if (y > this.waterAt(x) - 0.1) continue;
        this.emit('fleck', x, y, { z, size: [0.07, 0.1, 0.2][l], vy: -(0.12 + Math.random() * 0.12) * (1 - l * 0.25), vx: (Math.random() - 0.5) * 0.05, life, drag: 0.05, drift: 0.6, color: amb.snowCol, spread: 0 });
      }
    }
    // plankton motes on the mid layer
    if (amb.motes) {
      const D = cam.position.z + 2, hh = half * D, hw = hh * cam.aspect;
      this.ambAcc[3] += prime ? amb.motes : (amb.motes / 5) * dt;
      while (this.ambAcc[3] >= 1) {
        this.ambAcc[3] -= 1;
        const x = cam.position.x + (Math.random() * 2 - 1) * hw, y = cam.position.y + (Math.random() * 2 - 1) * hh;
        if (y > this.waterAt(x) - 0.2) continue;
        this.emit('mote', x, y, { z: -2 + Math.random() * 3, vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.08, life: 5, drag: 0.1, drift: 0.4, color: amb.moteCol, spread: 0 });
      }
    }
    // glints in the god rays near the surface
    if (amb.glints) {
      this.ambAcc[4] += amb.glints * dt;
      while (this.ambAcc[4] >= 1) {
        this.ambAcc[4] -= 1;
        const D = cam.position.z + 4, hh = half * D, hw = hh * cam.aspect;
        const x = cam.position.x + (Math.random() * 2 - 1) * hw, top = this.waterAt(x);
        const y = Math.min(top - 0.3, cam.position.y + Math.random() * hh);
        if (y < top - 9) continue;
        this.emit('glint', x, y, { z: -4 + Math.random() * 3, life: 0.5, spread: 0, color: '#fff8e0' });
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ gameplay helpers
  /** swim-wake bubbles shed behind a swimmer moving along dir (radians or a vector); speed scales the amount */
  wake(x: number, y: number, dir: Dir, speed = 1, z = 0) {
    if (y > this.waterAt(x) - 0.05) return;
    const a = angOf(dir) + Math.PI;
    const n = Math.random() < Math.min(1, 0.35 + speed * 0.4) ? 1 + (speed > 1.5 ? 1 : 0) : 0;
    for (let i = 0; i < n; i++) {
      const s = 0.4 + Math.random() * 0.6 * speed;
      this.emit(Math.random() < 0.85 ? 'bubbleS' : 'bubble', x + Math.cos(a) * 0.1, y + Math.sin(a) * 0.1, { vx: Math.cos(a) * s + (Math.random() - 0.5) * 0.4, vy: Math.sin(a) * s + 0.3, life: 1.2 + Math.random() * 0.8, z, spread: 0.06 });
    }
  }
  /** impact effect by kind; dir = direction of the blow (radians or vector), colour tints the star / sparks */
  hit(x: number, y: number, kind: HitKind = 'hit', dir?: Dir, color?: string, z = 0.15) {
    const a = angOf(dir, Math.random() * Math.PI * 2);
    switch (kind) {
      case 'hit':
        this.emit('hitStar', x, y, { size: 0.55, color: color ?? '#ffffff', spread: 0, z });
        this.sparks(x, y, 6, a, 5, color ?? '#ffffff', z);
        break;
      case 'crit':
        this.emit('hitStar', x, y, { size: 0.95, color: color ?? '#fff0a0', bright: 1.3, spread: 0, z });
        this.emit('ring', x, y, { size: 0.9, color: '#ffffff', spread: 0, z, life: 0.3 });
        this.sparks(x, y, 12, a, 7, color ?? '#ffe0a0', z);
        this.light(x, y, '#fff0c0', 4, 0.1);
        break;
      case 'block':
        this.emit('hitStar', x, y, { size: 0.45, color: '#c8e0ff', spread: 0, z });
        this.sparks(x, y, 10, a + Math.PI, 6, '#ffe8b0', z);
        this.emit('ring', x, y, { size: 0.6, color: '#c8e0ff', spread: 0, z, life: 0.25 });
        break;
      case 'slash':
        this.slash(x, y, a, 1, color ?? '#ffffff', z);
        this.sparks(x, y, 4, a, 4, color ?? '#ffffff', z);
        break;
      case 'frost': this.frost(x, y, 8, a, z); break;
      case 'zap': this.zaps(x, y, 3, z); break;
      case 'poison': this.poison(x, y, 6, z); break;
      case 'ink': this.inkCloud(x, y, 2, z); break;
      case 'magic': this.runes(x, y, color ?? '#9a8aff', 3, z); this.magic(x, y, color ?? '#9a8aff', 8, z); break;
      case 'fire':
        this.emit('fire', x, y, { n: 3, spread: 0.2, life: 0.5, z });
        this.emit('ember', x, y, { n: 6, speed: 2.5, vy: 1.5, grav: -3, drag: 1, life: 0.8, z });
        break;
    }
  }
  /** a pixel slash arc along angle (radians); size ~1 for a sword swing */
  slash(x: number, y: number, angle: number, size = 1, color = '#ffffff', z = 0.1) {
    this.emit('slash', x, y, { size: 1.3 * size, rot: angle, color, bright: 1.2, spread: 0, z, vx: Math.cos(angle) * 0.6, vy: Math.sin(angle) * 0.6, drag: 6 });
  }
  /** pickup sparkle burst (rising twinkles + a quick ring) */
  pickup(x: number, y: number, color = '#ffe070', z = 0.2) {
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; this.emit('sparkle', x, y, { vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4 + 0.6, drag: 4, color, life: 0.5 + Math.random() * 0.3, z, spread: 0.05 }); }
    this.emit('ring', x, y, { size: 0.7, color, spread: 0, z, life: 0.3 });
  }
  /** coin / material pop: spinning coins hop out and fall */
  coins(x: number, y: number, n = 6, z = 0.2) { this.emit('coinSpin', x, y, { n, speed: 2.5, vy: 3, grav: -9.8, drag: 0.6, life: 1.0, z, puff: true }); }
  /** heal: hearts float up */
  heal(x: number, y: number, n = 4, z = 0.3) { for (let i = 0; i < n; i++) this.emit('heartP', x + (Math.random() - 0.5) * 0.5, y, { vy: 0.8 + Math.random() * 0.4, vx: (Math.random() - 0.5) * 0.3, drag: 0.5, life: 0.9 + Math.random() * 0.3, z, delay: i * 0.08, spread: 0 }); }
  /** magic runes spinning out */
  runes(x: number, y: number, color = '#9a8aff', n = 4, z = 0.2) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; this.emit('rune', x, y, { vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2 + 0.3, drag: 3, color, bright: 1.1, life: 0.8, z, vr: (Math.random() - 0.5) * 3, spread: 0.1 }); } }
  /** frost shards flying along dir */
  frost(x: number, y: number, n = 8, dir?: number, z = 0.15) {
    for (let i = 0; i < n; i++) { const a = dir === undefined ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.6, s = 2 + Math.random() * 3; this.emit('frost', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 3, z, spread: 0.05 }); }
    this.emit('ring', x, y, { size: 0.7, color: '#c8f0ff', spread: 0, z, life: 0.3 });
  }
  /** electric zigzags around a point */
  zaps(x: number, y: number, n = 3, z = 0.2) { for (let i = 0; i < n; i++) this.emit('bolt', x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, { z, delay: i * 0.05, spread: 0, color: '#c8f4ff' }); this.light(x, y, '#9ad8ff', 3, 0.12); }
  /** poison bubbles fizzing up */
  poison(x: number, y: number, n = 6, z = 0.1) { this.emit('poison', x, y, { n, spread: 0.3, vy: 0.6, speed: 0.4, z }); }
  /** ink clouds */
  inkCloud(x: number, y: number, n = 2, z = 0) { this.emit('ink', x, y, { n, spread: 0.3, speed: 0.6, drag: 2.5, drift: 1, life: 2.4, z }); }

  /** a surface splash at x: animated crown, droplets fly up, bubbles get dragged down */
  splash(x: number, strength = 1, y = this.waterAt(x)) {
    const s = Math.min(3, strength);
    const sz = 0.7 + s * 0.45;
    this.emit('splash', x, y + sz * 0.5 - 0.06, { n: 1, size: sz, life: 0.5 + s * 0.08, spread: 0 });
    if (s > 1.2) this.emit('splash', x + (Math.random() - 0.5) * 0.4, y + sz * 0.35, { n: 1, size: sz * 0.7, life: 0.45, spread: 0, delay: 0.08 });
    this.emit('droplet', x, y + 0.05, { n: Math.round(6 + s * 10), spread: 0.25 * s, vy: 2.5 + s * 1.6, speed: 1.6 + s, life: 1.0, grav: -9.8, drag: 0.3 });
    this.emit('bubble', x, y - 0.25, { n: Math.round(4 + s * 8), spread: 0.4 * s, vy: -0.5 - s * 0.6, speed: 0.6 + s * 0.4, life: 2.2 });
    this.emit('ring', x, y, { n: 1, size: 0.6 + s * 0.6, life: 0.45, spread: 0 });
  }

  /**
   * Gore: blood + flesh. amount ~0.3 (nick) .. 1 (kill) .. 3 (explosive kill). dir = spray direction (radians or a
   * vector); omitted = all around.
   */
  gore(x: number, y: number, amount = 1, dir?: Dir, z = 0) {
    const a = Math.max(0.15, Math.min(4, amount));
    const has = dir !== undefined;
    const ang = angOf(dir);
    const cx = Math.cos(ang), cy = Math.sin(ang);
    const under = y < this.waterAt(x);
    const rnd = (k: number) => (Math.random() - 0.5) * 2 * k;
    if (under) {
      const nc = Math.round(2 + 4 * a);
      for (let i = 0; i < nc; i++) {
        const sp = has ? 0.4 + Math.random() * 1.4 * a : 0.6 * a;
        const aa = has ? ang + rnd(0.7) : Math.random() * Math.PI * 2;
        this.emit('blood', x + rnd(0.15 * a), y + rnd(0.15 * a), {
          vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp - 0.05, size: 0.6 + Math.random() * 0.4 * Math.min(2, a), size1: 1.0 + 0.4 * Math.min(2, a),
          life: 3 + Math.random() * 2.5, drag: 2.2, grav: -0.25, drift: 1, z, delay: i < 2 ? 0 : Math.random() * 0.15,
        });
      }
      this.emit('bloodDrop', x, y, { n: Math.round(6 + 10 * a), speed: 3.5 * Math.min(2, a), vx: has ? cx * 2.5 : 0, vy: has ? cy * 2.5 : 0, spread: 0.1, drag: 4.5, life: 0.9, size: 0.13, grav: -0.5, z });
      this.emit('gib', x, y, { n: Math.round(a * 1.6), speed: 2.2, vx: has ? cx * 1.5 : 0, vy: has ? cy * 1.5 : 0.3, drag: 2.5, grav: -0.9, life: 3.5, vr: rnd(3), z, puff: true });
      if (a >= 0.6) this.gibs(x, y, Math.round(1 + a * 2.2), 2.8 + a, ang, has ? 0.9 : Math.PI, z);
    } else {
      this.emit('bloodDrop', x, y, { n: Math.round(10 + 16 * a), speed: 2.5 + 3 * a, vx: has ? cx * (2 + 2 * a) : 0, vy: (has ? cy * (2 + 2 * a) : 0) + 1.2, spread: 0.12, drag: 0.4, life: 1.6, grav: -9.8, z });
      this.emit('gib', x, y, { n: Math.round(a * 2), speed: 4, vy: 3, grav: -9.8, drag: 0.3, life: 2.5, vr: rnd(10), z, puff: true });
      if (a >= 0.6) this.gibs(x, y, Math.round(1 + a * 2.2), 4 + a * 1.5, has ? ang : Math.PI / 2, has ? 0.8 : 1.2, z);
    }
  }
  /** a wisp of blood from a wound (call every few frames while bleeding; k ~0.2..1) */
  bleed(x: number, y: number, k = 0.4, z = 0) {
    if (y < this.waterAt(x)) this.emit('blood', x, y, { size: 0.28 + k * 0.3, size1: 0.6 + k * 0.4, life: 2 + k * 2, drag: 2.5, grav: -0.2, drift: 1, vx: (Math.random() - 0.5) * 0.3, vy: -0.1, z });
    else this.emit('bloodDrop', x, y, { vy: -0.5, speed: 0.6, grav: -9.8, drag: 0.3, life: 1.2, z });
  }
  /** sand / silt clouds billowing up off the seabed */
  silt(x: number, y: number, n = 8, spread = 0.6, z = 0) {
    for (let i = 0; i < n; i++) {
      const s = (Math.random() - 0.5) * 2;
      this.emit('silt', x + s * spread, y + Math.random() * 0.15, { vx: s * 0.9, vy: 0.3 + Math.random() * 0.6, size: 0.6 + Math.random() * 0.45, size1: 1.1 + Math.random() * 0.5, life: 1.6 + Math.random() * 1.6, drag: 2.0, grav: -0.35, drift: 0.7, z, delay: Math.random() * 0.1 });
    }
    this.emit('chip', x, y + 0.05, { n: Math.round(n * 0.6), speed: 2.5, vy: 2.2, grav: -9.8, drag: 1.2, color: '#c8b48c', z });
  }
  /** rising smoke puffs (in air); underwater this becomes silt-coloured murk */
  smoke(x: number, y: number, n = 4, z = 0) {
    const under = y < this.waterAt(x);
    for (let i = 0; i < n; i++) this.emit(under ? 'silt' : 'smoke', x, y, { spread: 0.25, vx: (Math.random() - 0.5) * 0.6, vy: under ? 0.3 : 0.9 + Math.random() * 0.5, size: 0.6 + Math.random() * 0.4, size1: 1.3, life: 1.8 + Math.random() * 1.5, drag: 1.2, grav: under ? -0.1 : 0, drift: 0.6, z, delay: Math.random() * 0.2 });
  }
  /** hot pixel sparks (velocity-oriented streaks); dir = main direction (radians) or omitted for radial */
  sparks(x: number, y: number, n = 12, dir?: number, speed = 6, color = '#ffffff', z = 0) {
    for (let i = 0; i < n; i++) {
      const a = dir === undefined ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * 1.3;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit('sparkPx', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: y < this.waterAt(x) ? 5 : 0.6, color, bright: 1.6, z, spread: 0.04 });
    }
  }
  /** mana twinkles + a crisp core flash (tinted: '#6fb4ff' blue, '#b07aff' purple ...) */
  magic(x: number, y: number, color = '#7ab8ff', n = 14, z = 0) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 2;
      this.emit('magic', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s + 0.4, drag: 3, color: c, bright: 0.9, life: 0.6 + Math.random() * 0.7, size: 0.32 + Math.random() * 0.2, z, spread: 0.1, delay: Math.random() * 0.12 });
    }
    this.emit('glow', x, y, { color: c, bright: 0.6, size: 1.0, size1: 0.3, life: 0.3, spread: 0, z });
    this.emit('rune', x, y, { color: c, size: 0.6, life: 0.5, spread: 0, z, vr: 2 });
    this.light(x, y, '#' + c.getHexString(), 3.5, 0.3);
  }
  /** expanding pixel shockwave ring */
  shockwave(x: number, y: number, size = 1, color = '#ffffff', z = 0.05) {
    this.emit('shock', x, y, { size: 2.2 * size, color, bright: 1.1, life: 0.4 + size * 0.06, spread: 0, z });
  }
  /** muzzle flash pointing along angle (radians), with a light flash and a puff */
  muzzle(x: number, y: number, angle: number, size = 1, z = 0.1) {
    const fx = x + Math.cos(angle) * 0.2 * size, fy = y + Math.sin(angle) * 0.2 * size;
    this.emit('muzzle', fx, fy, { size: 0.75 * size, rot: angle, bright: 2, spread: 0, z });
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
    if (!under) {
      this.emit('explosion', x, y, { size: 2.0 * s, life: 0.95, spread: 0, z, vy: 0.4 });
      for (let i = 0; i < 3; i++) this.emit('explosion', x + (Math.random() - 0.5) * s, y + (Math.random() - 0.3) * s * 0.8, { size: 1.2 * s, life: 0.8, spread: 0, z: z - 0.05, delay: 0.05 + i * 0.06, vy: 0.6 });
      this.smoke(x, y + 0.3 * s, Math.round(4 * s), z - 0.1);
      this.sparks(x, y, Math.round(22 * s), undefined, 9 * s, '#ffe8b0', z);
      this.emit('ember', x, y, { n: Math.round(10 * s), speed: 5 * s, vy: 2, grav: -6, drag: 0.5, life: 1.4, z });
      this.debrisBurst(x, y, Math.round(8 * s), '#5a5048', 6 * s, 0.1, z);
    } else {
      this.emit('explosion', x, y, { size: 1.6 * s, life: 0.45, spread: 0, z });
      this.emit('bubbleBig', x, y, { n: Math.round(16 * s), spread: 0.5 * s, speed: 3 * s, vy: 1.2, life: 2.5, z, delay: 0.05 });
      this.emit('bubble', x, y, { n: Math.round(40 * s), spread: 0.7 * s, speed: 4 * s, vy: 1, life: 2.5, z });
      this.sparks(x, y, Math.round(10 * s), undefined, 6 * s, '#ffe8b0', z);
      this.debrisBurst(x, y, Math.round(8 * s), '#5a5048', 4 * s, 0.1, z);
      if (y - this.floorAt(x) < 2.5 * s) this.silt(x, this.floorAt(x) + 0.1, Math.round(10 * s), 1.2 * s, z);
      else this.smoke(x, y, Math.round(3 * s), z);
    }
  }

  // ------------------------------------------------------------------------------------------------ simulation
  update(dt: number) {
    this.findRig()?.tick();
    if (this.amb) this.spawnAmbient(dt);
    for (const v of this.vents.values()) {
      v.acc += v.rate * dt;
      while (v.acc >= 1) { v.acc -= 1; this.emit(Math.random() < 0.8 ? 'bubbleS' : 'bubble', v.x + (Math.random() - 0.5) * 0.08, v.y, { vy: 0.5 + Math.random() * 0.4, life: 3, z: v.z, spread: 0 }); }
    }
    const ps = this.ps;
    const cur = this.current;
    let w = 0;
    const spawn: [number, number, number][] = [];
    const puffs: [number, number, number][] = [];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.delay > 0) { p.delay -= dt; ps[w++] = p; continue; }
      p.life -= dt;
      if (p.life <= 0) continue;
      const surf = this.waterAt(p.x);
      const under = p.y < surf;
      if (p.wob) {
        p.vy += (under ? 3.2 : -9.8) * dt;
        p.vx += Math.sin(p.life * 7 + p.seed * 100) * 1.6 * dt;
        if (under && p.y > surf - 0.06 && p.vy > 0) { p.life = 0; this.onSurfacePop?.(p.x, p.size); continue; }
      } else {
        p.vy += (under ? p.grav * 0.15 : p.grav === 0 ? 0 : -9.8) * dt;
      }
      if (p.k === 'bloodDrop' && under && !p.under) { spawn.push([p.x, surf - 0.05, p.z]); p.life = 0; continue; }
      p.under = under;
      const dr = Math.exp(-(under ? p.drag : 0.2) * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      const dk = under ? p.drift : 0;
      p.x += (p.vx + cur.x * dk) * dt; p.y += (p.vy + cur.y * dk) * dt; p.z += p.vz * dt;
      p.rot += p.vr * dt;
      const fl = this.floorAt(p.x);
      if (p.y < fl && !p.wob) {
        if (p.puff && p.vy < -0.8) { puffs.push([p.x, fl, p.z]); p.puff = false; }
        p.y = fl; p.vy *= -0.2; p.vx *= 0.5; p.vr *= 0.3;
      }
      ps[w++] = p;
    }
    ps.length = w;
    for (const [x, y, z] of spawn) this.emit('blood', x, y, { size: 0.32, size1: 0.7, life: 2.5, drag: 2.5, grav: -0.2, drift: 1, vy: -0.4, z });
    for (const [x, y, z] of puffs) this.touch(x, y, 0.4, z);
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
        // cut-out sprites pop off at the end of their life (or by their last frame); additive ones fade
        const fade = p.add ? clamp01(p.life / Math.min(0.25, p.max * 0.4)) : 1;
        this.aCol[wi * 4] = p.col.r; this.aCol[wi * 4 + 1] = p.col.g; this.aCol[wi * 4 + 2] = p.col.b; this.aCol[wi * 4 + 3] = p.alpha * fade;
        let f = p.frame;
        if (d.anim === 'life') f = Math.min(d.frames - 1, Math.floor(t * d.frames));
        else if (d.anim === 'loop') f = Math.floor((p.max - p.life) * (d.fps ?? 10) + p.seed * d.frames) % d.frames;
        const rect = R[p.k][f];
        this.aRect[wi * 4] = rect[0]; this.aRect[wi * 4 + 1] = rect[1]; this.aRect[wi * 4 + 2] = rect[2]; this.aRect[wi * 4 + 3] = rect[3];
        let rot = p.rot;
        if (d.rot === 'orient' && p.vx * p.vx + p.vy * p.vy > 0.01 && p.k !== 'muzzle' && p.k !== 'slash') { rot = Math.atan2(p.vy, p.vx); p.rot = rot; }
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
      if (d.y - d.s * 0.5 < fl) {
        if (!d.landed && d.vy < -0.6) this.touch(d.x, fl, Math.min(1, -d.vy * 0.3), d.z);
        d.landed = true;
        d.y = fl + d.s * 0.5; d.vy = Math.abs(d.vy) * 0.25; d.vx *= 0.6; d.vrx *= 0.5; d.vry *= 0.5;
      }
      d.rx += d.vrx * dt; d.ry += d.vry * dt;
      if (flesh && d.bleed > 0) {
        d.acc += dt * Math.min(1, Math.hypot(d.vx, d.vy) * 0.6 + 0.15);
        if (d.acc > (under ? 0.12 : 0.18)) {
          d.acc = 0;
          if (under) this.emit('blood', d.x, d.y, { size: 0.2 + d.s * 2, size1: 0.45 + d.s * 3, life: 1.6 + Math.random(), drag: 2.5, grav: -0.2, drift: 1, z: d.z });
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

  /** kept for compatibility: point sprites are sized from the post pipeline's internal resolution */
  setPixelScale(h: number, fovDeg: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
  clear() { this.ps.length = 0; this.debris.length = 0; this.gibList.length = 0; }
}
