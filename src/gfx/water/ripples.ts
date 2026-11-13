// GPU ripple heightfield for the water sheet: a damped 2D wave equation on a float texture, ping-ponged each
// substep (from FISHTOP's watergl.js SIM pass, rebuilt for WebGL2 float targets: no 16-bit packing needed,
// and the domain scrolls with the camera by whole texels so ripples stay put in the world).
// Domain: x in [x0, x0 + W], z in [z0, z0 + D] on the y = 0 sheet. r = height (m), g = previous height.
import * as THREE from 'three';

const MAX_IMP = 32;
const VS = /* glsl */ `out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const SIM_FS = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D uTex; uniform vec2 uTexel; uniform vec2 uShift; uniform float uC; uniform float uDamp;
uniform vec4 uImp[${MAX_IMP}]; uniform int uNImp;
float H(vec2 uv) { if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0; return texture(uTex, uv).r; }
void main() {
  vec2 uv = vUv + uShift * uTexel;
  vec4 s = (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture(uTex, uv);
  float h = s.r, hp = s.g;
  float lap = H(uv + vec2(uTexel.x, 0.0)) + H(uv - vec2(uTexel.x, 0.0)) + H(uv + vec2(0.0, uTexel.y)) + H(uv - vec2(0.0, uTexel.y)) - 4.0 * h;
  float hn = (2.0 * h - hp + uC * lap) * uDamp - h * 0.0015;
  for (int i = 0; i < ${MAX_IMP}; i++) {
    if (i >= uNImp) break;
    vec4 im = uImp[i];
    vec2 d = (vUv - im.xy) / uTexel / im.w;
    float r2 = dot(d, d);
    if (r2 < 1.0) hn -= im.z * (1.0 - r2) * (1.0 - r2);
  }
  // soft absorbing border
  vec2 e = min(vUv, 1.0 - vUv);
  hn *= smoothstep(0.0, 0.04, min(e.x, e.y));
  fragColor = vec4(clamp(hn, -0.6, 0.6), h, 0.0, 1.0);
}`;

export class Ripples {
  res = new THREE.Vector2(512, 256);
  W = 64; D = 32; z0 = -26;
  x0 = -32;
  private rts: THREE.WebGLRenderTarget[];
  private cur = 0;
  private mat: THREE.ShaderMaterial;
  private quad: THREE.Mesh;
  private cam = new THREE.Camera();
  private scene = new THREE.Scene();
  private imps: { x: number; z: number; s: number; r: number }[] = [];
  private acc = 0;
  private shiftX = 0;

  constructor() {
    const mk = () => new THREE.WebGLRenderTarget(this.res.x, this.res.y, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.rts = [mk(), mk()];
    this.mat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VS, fragmentShader: SIM_FS, depthTest: false, depthWrite: false,
      uniforms: {
        uTex: { value: null }, uTexel: { value: new THREE.Vector2(1 / this.res.x, 1 / this.res.y) }, uShift: { value: new THREE.Vector2() },
        uC: { value: 0.42 }, uDamp: { value: 0.988 }, uImp: { value: Array.from({ length: MAX_IMP }, () => new THREE.Vector4()) }, uNImp: { value: 0 },
      },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }
  get texture() { return this.rts[this.cur].texture; }
  get texelX() { return this.W / this.res.x; }

  /** an impulse at world (x, z): strength in metres of push (+ = down), radius in metres */
  impulse(x: number, z: number, s: number, r = 0.4) {
    if (this.imps.length >= MAX_IMP) this.imps.shift();
    this.imps.push({ x, z, s, r });
  }

  update(renderer: THREE.WebGLRenderer, dt: number, cx: number) {
    // keep centred: shift by whole texels
    const want = Math.round((cx - this.W / 2) / this.texelX);
    const have = Math.round(this.x0 / this.texelX);
    this.shiftX += want - have;
    this.x0 = want * this.texelX;
    this.acc = Math.min(0.1, this.acc + dt);
    const prevRT = renderer.getRenderTarget();
    let first = true;
    while (this.acc >= 1 / 60) {
      this.acc -= 1 / 60;
      const u = this.mat.uniforms;
      u.uTex.value = this.rts[this.cur].texture;
      u.uShift.value.set(this.shiftX, 0);
      this.shiftX = 0;
      if (first) {
        const n = this.imps.length;
        for (let i = 0; i < n; i++) {
          const im = this.imps[i];
          u.uImp.value[i].set((im.x - this.x0) / this.W, (im.z - this.z0) / this.D, im.s * 0.06, Math.max(1.5, im.r / this.texelX));
        }
        u.uNImp.value = n;
        this.imps.length = 0;
        first = false;
      } else u.uNImp.value = 0;
      this.cur ^= 1;
      renderer.setRenderTarget(this.rts[this.cur]);
      renderer.render(this.scene, this.cam);
    }
    renderer.setRenderTarget(prevRT);
  }
}
