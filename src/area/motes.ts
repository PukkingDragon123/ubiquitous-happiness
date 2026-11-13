// Parallax sparkle layers for the darker areas: marine snow / plankton motes in depth bands around the camera
// (a far dim layer, a play-plane layer, a big soft-edged near layer that slides past fastest), hard pixel specks
// that twinkle. Near the play plane they swirl in the blobfish's wake: the last second of its path is handed to
// the shader as a short trail, and specks within reach are spun around it (and, for bioluminescent plankton, flare
// up bright the way dinoflagellates do when the water is disturbed). All on the GPU; the CPU only updates the trail.
import * as THREE from 'three';
import type { World } from '../game/types';
import { UW } from '../gfx/shaders/underwater';

export interface MoteLayer {
  n: number; z0: number; z1: number;
  /** speck size in metres, brightness, colour */
  size: number; k: number; col: string;
  /** drift speed multiplier (parallax feel) and twinkle rate */
  drift?: number; twinkle?: number;
  /** how strongly the wake swirls / lights this layer (0 = not at all) */
  swirl?: number; flare?: number;
}

const TRAIL = 10;

export class Motes {
  group = new THREE.Group();
  private mats: THREE.ShaderMaterial[] = [];
  private trail: THREE.Vector4[] = Array.from({ length: TRAIL }, () => new THREE.Vector4(0, -999, 99, 0));
  private head = 0;
  private acc = 0;
  private lx = 0; private ly = -999;
  private uCam = { value: new THREE.Vector3() };
  private uScale = { value: 500 };

  constructor(layers: MoteLayer[], w: World) {
    this.uScale.value = w.game.h * Math.min(devicePixelRatio || 1, 1.5) / (2 * Math.tan((w.camera.fov * Math.PI) / 360));
    for (const L of layers) {
      const n = L.n, p = new Float32Array(n * 3), sd = new Float32Array(n);
      for (let i = 0; i < n; i++) { p[i * 3] = Math.random() * 48; p[i * 3 + 1] = Math.random() * 30; p[i * 3 + 2] = L.z0 + Math.random() * (L.z1 - L.z0); sd[i] = Math.random(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uCam: this.uCam, uT: UW.uTime, uScale: this.uScale, uTrail: { value: this.trail },
          uCol: { value: new THREE.Color(L.col).multiplyScalar(L.k) }, uSize: { value: L.size }, uDrift: { value: L.drift ?? 1 }, uTw: { value: L.twinkle ?? 1 },
          uSwirl: { value: L.swirl ?? 0 }, uFlare: { value: L.flare ?? 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aSeed;
          uniform vec3 uCam; uniform float uT; uniform float uScale; uniform vec4 uTrail[${TRAIL}];
          uniform float uSize; uniform float uDrift; uniform float uTw; uniform float uSwirl; uniform float uFlare;
          varying float vA; varying float vF;
          void main() {
            vec2 box = vec2(48.0, 30.0);
            vec3 p = position;
            vec2 drift = vec2(sin(uT * 0.13 + aSeed * 31.0) * 0.5 + uT * 0.07, -uT * (0.03 + aSeed * 0.05) + cos(uT * 0.11 + aSeed * 17.0) * 0.3) * uDrift;
            p.xy = mod(p.xy + drift - uCam.xy + box * 0.5, box) - box * 0.5 + uCam.xy;
            // the wake: spin specks round the recent path, push them aside, light them up
            float stir = 0.0;
            vec2 off = vec2(0.0);
            for (int i = 0; i < ${TRAIL}; i++) {
              vec4 tr = uTrail[i];
              vec2 d = p.xy - tr.xy;
              float r2 = dot(d, d);
              float w = exp(-r2 * 0.9) * exp(-tr.z * 1.6) * tr.w;
              off += (vec2(-d.y, d.x) * 0.9 + d * 0.35) * w;
              stir += w;
            }
            float zk = 1.0 - smoothstep(1.5, 4.0, abs(p.z));
            p.xy += off * uSwirl * zk;
            stir *= zk;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float tw = 0.55 + 0.45 * sin(uT * (0.8 + aSeed * 2.5) * uTw + aSeed * 50.0);
            vF = min(1.0, stir * uFlare);
            vA = tw * smoothstep(70.0, 6.0, -mv.z) * step(p.y, -0.3) + vF * 1.5;
            gl_PointSize = max(1.0, floor(uSize * (0.7 + aSeed * 0.6) * uScale / -mv.z + 0.5 + vF * 1.5));
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCol; varying float vA; varying float vF;
          void main() {
            if (vA < 0.3) discard;
            // two hard tones (no soft blobs): dim speck, bright when twinkling or stirred
            float hi = step(0.82, vA);
            gl_FragColor = vec4(uCol * (0.5 + hi * 0.6) + vec3(0.25, 0.6, 0.7) * vF * uCol.b, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const pts = new THREE.Points(g, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 14;
      this.group.add(pts);
      this.mats.push(mat);
    }
    this.group.name = 'motes';
  }

  update(dt: number, camX: number, camY: number, px: number, py: number, speed: number) {
    this.uCam.value.set(camX, camY, 0);
    for (const t of this.trail) t.z += dt;
    this.acc += dt;
    const moved = Math.hypot(px - this.lx, py - this.ly);
    if (this.acc > 0.1 && (moved > 0.25 || speed > 0.6)) {
      this.acc = 0; this.lx = px; this.ly = py;
      this.trail[this.head].set(px, py, 0, Math.min(1.2, 0.3 + speed * 0.25));
      this.head = (this.head + 1) % TRAIL;
    }
  }
  /** a burst of stir at (x, y): explosions light the plankton up */
  stir(x: number, y: number, k: number) {
    for (let i = 0; i < 3; i++) { this.trail[this.head].set(x + (i - 1) * 0.6, y, 0, k); this.head = (this.head + 1) % TRAIL; }
  }

  dispose() { for (const m of this.mats) m.dispose(); for (const c of this.group.children) (c as THREE.Points).geometry.dispose(); this.group.removeFromParent(); }
}
