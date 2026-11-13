// A sword slash trail: a ribbon between the blade's base and tip over the last few frames, additive, fading
// along its length with a pixel-stepped edge so it reads as a crisp hand-drawn swoosh.
import * as THREE from 'three';

export class SlashTrail {
  mesh: THREE.Mesh;
  private n = 14;
  private base: THREE.Vector3[] = [];
  private tip: THREE.Vector3[] = [];
  private age: number[] = [];
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  active = false;

  constructor(color = new THREE.Color('#dff9ff')) {
    const pos = new Float32Array(this.n * 2 * 3), uv = new Float32Array(this.n * 2 * 2), idx: number[] = [];
    for (let i = 0; i < this.n; i++) { uv[i * 4] = i / (this.n - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / (this.n - 1); uv[i * 4 + 3] = 1; }
    for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: color }, uK: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 uCol; uniform float uK; varying vec2 vUv;
        void main() {
          float along = vUv.x;            // 0 newest .. 1 oldest
          float across = vUv.y;           // 0 base .. 1 tip
          float a = (1.0 - along) * smoothstep(0.15, 0.9, across);
          a = floor(a * 5.0) / 5.0;       // stepped bands
          if (a <= 0.0) discard;
          vec3 c = mix(uCol * 0.6, vec3(1.0), step(0.85, across) * (1.0 - along));
          gl_FragColor = vec4(c * a * 1.4 * uK, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 30;
    for (let i = 0; i < this.n; i++) { this.base.push(new THREE.Vector3()); this.tip.push(new THREE.Vector3()); this.age.push(99); }
  }

  setColor(c: THREE.Color) { this.mat.uniforms.uCol.value.copy(c); }

  push(base: THREE.Vector3, tip: THREE.Vector3) {
    this.base.pop(); this.tip.pop(); this.age.pop();
    this.base.unshift(base.clone()); this.tip.unshift(tip.clone()); this.age.unshift(0);
  }

  update(dt: number) {
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    let live = false;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      const fade = this.age[i] > 0.12 ? 1 : 0;
      const b = this.base[i], t = this.tip[i];
      // collapse old segments onto the tip so they vanish smoothly
      const c = fade ? t : b;
      pos.setXYZ(i * 2, c.x, c.y, c.z + 0.02);
      pos.setXYZ(i * 2 + 1, t.x, t.y, t.z + 0.02);
      if (!fade) live = true;
    }
    pos.needsUpdate = true;
    this.mesh.visible = live;
  }
}
