// A crossroads current: a swirling vortex of rushing water that leads back to the map. Spiral ribbons with
// streaming foam chevrons spin into the distance, bubbles get sucked in, and swimming into its mouth whisks the
// blobfish away (spin, stretch, whoosh) before the callback fires.
import * as THREE from 'three';
import type { Entity, World, Team } from './types';
import type { Blobfish } from '../player/blobfish';

export class Current implements Entity {
  kind = 'current'; team: Team = 'neutral';
  x: number; y: number; vx = 0; vy = 0; r = 1.2; alive = true;
  obj = new THREE.Group();
  private mat: THREE.ShaderMaterial;
  private t = 0;
  private taking = -1;
  private onEnter: () => void;
  private loop: { set(v: number, r?: number): void; stop(f?: number): void } | null = null;

  constructor(x: number, y: number, onEnter: () => void) {
    this.x = x; this.y = y; this.onEnter = onEnter;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uT; uniform float uK; varying vec2 vUv;
        void main() {
          // chevrons streaming along the ribbon into the vortex
          float s = fract(vUv.x * 7.0 - uT * 1.6 + abs(vUv.y - 0.5) * 1.2);
          float chev = step(0.72, s);
          float edge = smoothstep(0.5, 0.2, abs(vUv.y - 0.5));
          float fade = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.6, vUv.x);
          vec3 c = mix(vec3(0.35, 0.85, 1.0), vec3(1.0), chev);
          float a = (0.25 + chev * 0.75) * edge * fade * uK;
          a = floor(a * 6.0) / 6.0;
          gl_FragColor = vec4(c * a * 1.4, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    // three spiral ribbons corkscrewing back into the depth
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 80; i++) {
        const t = i / 80, a = t * Math.PI * 6 + (k * Math.PI * 2) / 3, rr = 1.3 * (1 - t * 0.75);
        pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, -t * 18));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const geo = new THREE.TubeGeometry(curve, 160, 0.12, 4, false);
      // flatten the tube into a ribbon by squashing its radius direction (keeps uv.x along, uv.y across)
      const m = new THREE.Mesh(geo, this.mat);
      m.frustumCulled = false;
      this.obj.add(m);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 16), new THREE.MeshBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.obj.add(core);
    this.obj.position.set(x, y, 0);
  }

  update(dt: number, w: World) {
    this.t += dt;
    const k = Math.min(1, this.t / 1.2);
    this.mat.uniforms.uT.value = this.t; this.mat.uniforms.uK.value = k;
    this.obj.rotation.z = this.t * 1.8;
    this.obj.scale.setScalar(0.3 + k * 0.7 + Math.sin(this.t * 3) * 0.03);
    if (!this.loop) this.loop = { set() {}, stop() {} };
    // suck in bubbles and debris
    if (Math.random() < dt * 30) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 1.5;
      w.fx.emit('bubble', this.x + Math.cos(a) * r, this.y + Math.sin(a) * r, { n: 1, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 0.6, size: 0.1 });
    }
    const p = w.player as Blobfish;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.taking < 0 && d < 3.5 && !p.hooked) p.applyForce((this.x - p.x) * 2.2, (this.y - p.y) * 2.2);
    if (this.taking < 0 && d < this.r && !p.hooked && p.alive) {
      this.taking = 0;
      w.sfx('travel', this.x, 1); w.sfx('flood_rush1', this.x, 0.7);
      w.text.pop('WHOOSH!', p.x, p.y + 1, 'shout', { size: 0.5 });
      w.game.addShake(0.2);
    }
    if (this.taking >= 0) {
      this.taking += dt;
      p.carried = (dd) => { p.sb.accel((this.x - p.x) * 30 - p.vx * 5, (this.y - p.y) * 30 - p.vy * 5, dd); };
      p.sb.stretch = 0.5; p.sb.angle += dt * 12;
      p.obj.scale.setScalar(Math.max(0.05, 1 - this.taking * 0.9));
      w.game.flash('#bff6ff', this.taking * 0.5);
      if (this.taking > 1.1) { this.taking = -99; p.carried = null; this.onEnter(); }
    }
  }
  dispose() { this.loop?.stop(); }
}
