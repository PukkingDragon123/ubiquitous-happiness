// The render pipeline: scene -> HDR (MSAA, depth) -> underwater optics -> bloom -> grade -> screen, then an
// overlay pass (floating text, diegetic UI) on top.
//
// Underwater optics (one full-screen pass, reconstructing each pixel's world ray from the depth buffer):
//   - the water is a slab: y below the live surface and z behind the front cut (FRONT_Z), so the screen reads
//     as a cross-section aquarium; we find the part of each view ray inside it;
//   - Beer-Lambert absorption per channel over that path (reds die first), with depth-dependent in-scatter
//     (bright turquoise near the surface, ink blue in the deep) — a clear zone keeps the gameplay plane vivid;
//   - volumetric god rays: ray-marched light shafts along the in-water segment, aligned with the refracted sun,
//     brighter under wave crests, drifting slowly;
//   - refraction wobble for anything seen through water, much stronger for things above the surface seen
//     from below (Snell's window distortion), and a lens waterline when the near plane straddles the surface;
//   - marine haze grain.
import * as THREE from 'three';
import { UW } from './shaders/underwater';
import { SURF, FRONT_Z } from './water/surface';
import { NOISE_GLSL } from './sky';

const FS_VS = /* glsl */ `out vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const POST = {
  uScatterTop: { value: new THREE.Color('#3fc3d8') },
  uScatterDeep: { value: new THREE.Color('#06213f') },
  uExt: { value: new THREE.Vector3(0.11, 0.045, 0.032) },
  uClear: { value: 7.0 },
  uScatterDepthK: { value: 0.035 },
  uRays: { value: 1.0 },
  uRayCol: { value: new THREE.Color('#e8fff4') },
  uWobble: { value: 1.0 },
  // grading
  uExposure: { value: 1.0 },
  uSaturation: { value: 1.12 },
  uContrast: { value: 1.06 },
  uGradeLift: { value: new THREE.Vector3(0.0, 0.012, 0.03) },
  uGain: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
  uVignette: { value: 0.35 },
  uChroma: { value: 0.0007 },
  uBloom: { value: 0.55 },
  uBloomThreshold: { value: 0.85 },
  uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, // rgb + amount (hit flashes, ability flashes)
  uDesat: { value: 0 },          // e.g. when dragged up / low health
  uPulse: { value: 0 },          // red heartbeat vignette 0..1
  uUnderwaterPost: { value: 1 }, // 0 disables the water optics (map / backpack scenes)
};

const UW_FS = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform float uNear; uniform float uFar;
uniform float uTime; uniform vec3 uSunDir; uniform float uWaterY; uniform float uFrontZ;
uniform sampler2D uLift; uniform vec2 uLiftBox; uniform vec4 uSwell[3];
uniform vec3 uScatterTop; uniform vec3 uScatterDeep; uniform vec3 uExt; uniform float uClear; uniform float uScatterDepthK;
uniform float uRays; uniform vec3 uRayCol; uniform float uWobble; uniform float uUnderwaterPost;
${NOISE_GLSL}
vec3 swellAt(vec2 p, float t) {
  vec3 o = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    vec4 w = uSwell[i]; if (w.x < 0.0005) continue;
    float k = 6.2831853 / w.y, a = (float(i) - 1.0) * 0.42;
    vec2 d = vec2(cos(a) * sign(w.z + 1e-6), sin(a));
    float th = k * dot(d, p) - k * abs(w.z) * t + float(i) * 1.7;
    o.y += w.x * cos(th);
  }
  return o;
}
float waterH(float x, float z) {
  float u = (x - uLiftBox.x) / uLiftBox.y;
  float lift = (u > 0.0 && u < 1.0) ? texture(uLift, vec2(u, 0.5)).r * exp(-abs(z) * 0.35) : 0.0;
  return uWaterY + swellAt(vec2(x, z), uTime).y + lift;
}
vec3 viewRay(vec2 uv) {
  vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return normalize(mat3(uCamWorld) * (v.xyz / v.w));
}
float linDepth(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float shaft(vec3 p) {
  // project onto the plane perpendicular to the (refracted) sun: shafts are lines along uSunDir
  vec2 q = vec2(p.x - p.y * uSunDir.x / uSunDir.y, p.z - p.y * uSunDir.z / uSunDir.y);
  float n = fbm2(vec2(q.x * 0.33 + uTime * 0.035, q.y * 0.12));
  float n2 = vnoise(vec2(q.x * 1.4 - uTime * 0.11, q.y * 0.5));
  float s = smoothstep(0.5, 0.8, n) * (0.55 + 0.45 * n2);
  // brighter under crests: sample the surface where the shaft entered
  float crest = swellAt(q, uTime).y;
  return s * (1.0 + crest * 2.5);
}
void main() {
  vec2 uv = vUv;
  vec3 dir = viewRay(uv);
  float d = texture(tDepth, uv).r;
  float viewZ = linDepth(d);
  vec3 fwd = normalize(mat3(uCamWorld) * vec3(0.0, 0.0, -1.0));
  float tHit = d >= 0.99999 ? 1e4 : viewZ / max(dot(dir, fwd), 1e-3);
  vec3 C = uCamPos;
  // ---- the in-water segment of the ray [t0, t1]
  float t0 = 0.0, t1 = 0.0;
  bool camIn = C.z <= uFrontZ && C.y < waterH(C.x, C.z);
  float tFront = dir.z < 0.0 ? (uFrontZ - C.z) / dir.z : -1.0;
  if (camIn) { t0 = 0.0; }
  else if (C.z > uFrontZ && tFront > 0.0) {
    vec3 pf = C + dir * tFront;
    if (pf.y < waterH(pf.x, uFrontZ)) t0 = tFront;
    else if (dir.y < 0.0) { float ts = (uWaterY - C.y) / dir.y; t0 = ts > tFront ? ts : 1e5; }
    else t0 = 1e5;
  } else if (dir.y < 0.0 && C.y > uWaterY) { t0 = (uWaterY - C.y) / dir.y; }
  else t0 = 1e5;
  if (t0 < 1e5) {
    vec3 p0 = C + dir * t0;
    t1 = tHit;
    if (dir.y > 0.0) {
      float ts = t0 + (waterH(p0.x, p0.z) + 0.05 - p0.y) / dir.y;
      // refine once with the wave height where it exits
      vec3 pe = C + dir * ts; ts = t0 + (waterH(pe.x, pe.z) - p0.y) / dir.y;
      t1 = min(t1, max(ts, t0));
    }
  }
  float path = max(0.0, min(t1, 400.0) - t0);
  bool seenThrough = path > 0.0;
  bool exitsUp = seenThrough && t1 < tHit - 0.01;   // the surface is between us and the hit: viewing the air world from below
  // ---- refraction wobble
  vec2 wob = vec2(0.0);
  if (seenThrough && uUnderwaterPost > 0.5) {
    vec3 hp = C + dir * min(tHit, 60.0);
    float k = exitsUp ? 0.012 : 0.0016 * clamp(path / 20.0, 0.25, 1.0);
    wob = vec2(vnoise(hp.xy * 1.3 + uTime * 0.6) - 0.5, vnoise(hp.yx * 1.1 - uTime * 0.5 + 7.0) - 0.5) * k * uWobble;
  }
  vec3 col = texture(tColor, uv + wob).rgb;
  if (uUnderwaterPost < 0.5) { fragColor = vec4(col, 1.0); return; }
  if (seenThrough) {
    // ---- absorption + in-scatter
    vec3 pe = C + dir * min(t1, 400.0);
    float depthEnd = max(0.0, uWaterY - pe.y);
    float lp = max(0.0, path - uClear);
    vec3 T = exp(-uExt * lp);
    float avgDepth = max(0.0, uWaterY - (C + dir * (t0 + min(path, 60.0) * 0.5)).y);
    vec3 scat = mix(uScatterTop, uScatterDeep, 1.0 - exp(-avgDepth * uScatterDepthK));
    // looking up toward the light the haze glows
    scat *= 1.0 + 0.35 * max(dir.y, 0.0);
    col = col * T + scat * (1.0 - T);
    // ---- god rays (ray-marched)
    if (uRays > 0.0) {
      float L = min(path, 70.0);
      float acc = 0.0;
      float jitter = nhash(uv * 731.7 + fract(uTime * 7.0));
      for (int i = 0; i < 10; i++) {
        float s = t0 + (float(i) + jitter) / 10.0 * L;
        vec3 p = C + dir * s;
        float dep = uWaterY - p.y;
        if (dep < 0.0) continue;
        float att = exp(-dep * 0.06) * exp(-max(0.0, s - t0 - uClear) * 0.03);
        acc += shaft(p) * att;
      }
      col += uRayCol * acc / 10.0 * min(L, 40.0) * 0.045 * uRays * mix(vec3(1.0), uScatterTop * 1.6, 0.35);
    }
  }
  fragColor = vec4(col, 1.0);
}`;

const BRIGHT_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform float uThreshold;
void main() {
  vec3 c = texture(tSrc, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold + 0.6, l);
  fragColor = vec4(c * k, 1.0);
}`;
// 13-tap downsample (Call of Duty style) and 9-tap tent upsample
const DOWN_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform vec2 uTexel;
void main() {
  vec2 t = uTexel;
  vec3 a = texture(tSrc, vUv + t * vec2(-2, 2)).rgb, b = texture(tSrc, vUv + t * vec2(0, 2)).rgb, c = texture(tSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture(tSrc, vUv + t * vec2(-2, 0)).rgb, e = texture(tSrc, vUv).rgb, f = texture(tSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(tSrc, vUv + t * vec2(-2, -2)).rgb, h = texture(tSrc, vUv + t * vec2(0, -2)).rgb, i = texture(tSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture(tSrc, vUv + t * vec2(-1, 1)).rgb, k = texture(tSrc, vUv + t * vec2(1, 1)).rgb, l = texture(tSrc, vUv + t * vec2(-1, -1)).rgb, m = texture(tSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  fragColor = vec4(o, 1.0);
}`;
const UP_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform sampler2D tPrev; uniform vec2 uTexel; uniform float uRadius;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture(tSrc, vUv).rgb * 4.0;
  s += (texture(tSrc, vUv + vec2(-t.x, 0)).rgb + texture(tSrc, vUv + vec2(t.x, 0)).rgb + texture(tSrc, vUv + vec2(0, -t.y)).rgb + texture(tSrc, vUv + vec2(0, t.y)).rgb) * 2.0;
  s += texture(tSrc, vUv + vec2(-t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(t.x, -t.y)).rgb + texture(tSrc, vUv + vec2(-t.x, t.y)).rgb + texture(tSrc, vUv + vec2(t.x, t.y)).rgb;
  fragColor = vec4(s / 16.0 + texture(tPrev, vUv).rgb, 1.0);
}`;
const FINAL_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure; uniform float uSaturation; uniform float uContrast;
uniform vec3 uGradeLift; uniform vec3 uGain; uniform float uVignette; uniform float uChroma; uniform float uTime; uniform vec4 uFlash; uniform float uDesat; uniform float uPulse;
uniform vec2 uRes;
vec3 aces(vec3 x) { const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 off = cc * r2 * uChroma * 18.0;
  vec3 col;
  col.r = texture(tSrc, uv + off).r;
  col.g = texture(tSrc, uv).g;
  col.b = texture(tSrc, uv - off).b;
  col += texture(tBloom, uv).rgb * uBloom;
  col *= uExposure;
  col = aces(col * 0.92);
  col = pow(col, vec3(1.0 / 2.2));
  // grade
  col = col * uGain + uGradeLift * (1.0 - col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation * (1.0 - uDesat * 0.8));
  col = (col - 0.5) * uContrast + 0.5;
  // vignette + heartbeat pulse
  float v = smoothstep(0.85, 0.2, r2 * 1.6);
  col *= mix(1.0, v, uVignette);
  col = mix(col, vec3(0.6, 0.0, 0.05), uPulse * smoothstep(0.1, 0.5, r2) * 0.55);
  col = mix(col, uFlash.rgb, uFlash.a);
  // fine grain + dither (kills banding in the deep gradients)
  float g = h12(uv * uRes + fract(uTime * 13.0) * 100.0) - 0.5;
  col += g * (1.5 / 255.0) + g * 0.012 * (1.0 - l);
  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function fsMat(fs: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FS_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
}

export class Post {
  renderer: THREE.WebGLRenderer;
  sceneRT: THREE.WebGLRenderTarget;
  uwRT: THREE.WebGLRenderTarget;
  bloomDown: THREE.WebGLRenderTarget[] = [];
  bloomUp: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private uwMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private finalMat: THREE.ShaderMaterial;
  private black: THREE.DataTexture;
  w = 1; h = 1;
  scale = 1;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.FloatType;
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4, depthTexture, depthBuffer: true });
    this.uwRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    for (let i = 0; i < 6; i++) {
      this.bloomDown.push(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
      this.bloomUp.push(new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
    }
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.uwMat = fsMat(UW_FS, {
      tColor: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uTime: UW.uTime, uSunDir: UW.uSunDir, uWaterY: UW.uWaterY,
      uFrontZ: { value: FRONT_Z }, uLift: SURF.uLift, uLiftBox: SURF.uLiftBox, uSwell: SURF.uSwell,
      ...POST,
    });
    this.brightMat = fsMat(BRIGHT_FS, { tSrc: { value: null }, uThreshold: POST.uBloomThreshold });
    this.downMat = fsMat(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = fsMat(UP_FS, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } });
    this.finalMat = fsMat(FINAL_FS, { tSrc: { value: null }, tBloom: { value: null }, uTime: UW.uTime, uRes: { value: new THREE.Vector2() }, ...POST });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.uwMat);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  setSize(w: number, h: number, pixelRatio: number) {
    const W = Math.max(1, Math.floor(w * pixelRatio * this.scale)), H = Math.max(1, Math.floor(h * pixelRatio * this.scale));
    this.w = W; this.h = H;
    this.sceneRT.setSize(W, H);
    this.uwRT.setSize(W, H);
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < this.bloomDown.length; i++) {
      this.bloomDown[i].setSize(Math.max(1, bw), Math.max(1, bh));
      this.bloomUp[i].setSize(Math.max(1, bw), Math.max(1, bh));
      bw >>= 1; bh >>= 1;
    }
    this.finalMat.uniforms.uRes.value.set(W, H);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qScene, this.qCam);
  }

  /** render the world scene through the full chain, then overlays (no post) on top */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlays: { scene: THREE.Scene; camera: THREE.Camera }[] = []) {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    // underwater optics
    const u = this.uwMat.uniforms;
    u.tColor.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    this.pass(this.uwMat, this.uwRT);
    // bloom
    this.brightMat.uniforms.tSrc.value = this.uwRT.texture;
    this.pass(this.brightMat, this.bloomDown[0]);
    for (let i = 1; i < this.bloomDown.length; i++) {
      const src = this.bloomDown[i - 1];
      this.downMat.uniforms.tSrc.value = src.texture;
      this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(this.downMat, this.bloomDown[i]);
    }
    let prev: THREE.Texture = this.black;
    for (let i = this.bloomDown.length - 1; i >= 0; i--) {
      const src = this.bloomDown[i];
      this.upMat.uniforms.tSrc.value = src.texture;
      this.upMat.uniforms.tPrev.value = prev;
      this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.pass(this.upMat, this.bloomUp[i]);
      prev = this.bloomUp[i].texture;
    }
    // final
    this.finalMat.uniforms.tSrc.value = this.uwRT.texture;
    this.finalMat.uniforms.tBloom.value = this.bloomUp[0].texture;
    this.pass(this.finalMat, null);
    // overlays straight to screen
    r.autoClear = false;
    for (const o of overlays) { r.clearDepth(); r.render(o.scene, o.camera); }
    r.autoClear = true;
  }
}
