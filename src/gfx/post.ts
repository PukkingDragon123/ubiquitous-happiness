// The retro cinematic render pipeline (PS1/PS2 look, filmic grade). Everything 3D renders at a LOW internal
// resolution (default ~360 px tall, integer nearest upscale), then:
//
//   scene (HDR, depth) -> underwater optics / dry fog -> MOTION BLUR (+ reprojected frame feedback)
//     -> bloom -> filmic tonemap + grade + split tone + grain + vignette + CA -> fade -> letterbox
//     -> ordered-dither colour quantise (PS1 15-bit style) -> nearest upscale to the screen -> overlays (UI, crisp)
//
// Underwater optics (one full-screen pass, reconstructing each pixel's world ray from the depth buffer):
//   - the water is a slab: y below the live surface and z behind the front cut (FRONT_Z), so the screen reads
//     as a cross-section aquarium; we find the part of each view ray inside it;
//   - Beer-Lambert absorption per channel over that path (reds die first), with depth-dependent in-scatter
//     (bright turquoise near the surface, ink blue in the deep) — a clear zone keeps the gameplay plane vivid;
//   - volumetric god rays: ray-marched light shafts along the in-water segment, aligned with the refracted sun,
//     brighter under wave crests, drifting slowly;
//   - refraction wobble for anything seen through water, much stronger for things above the surface seen
//     from below (Snell's window distortion);
//   - dry scenes (Screen.underwater === false) get plain exponential distance fog instead (POST.uDryFog).
//
// Motion blur (the user wants a LOT of it):
//   - camera blur: each pixel's world position (from depth) is reprojected with last frame's view-projection;
//     the screen-space velocity is sampled along (centred) with depth-aware taps. POST.uMotionBlur scales the
//     shutter (1 = one frame's worth of motion, 2 = exaggerated), POST.uMotionMax caps it (fraction of screen);
//   - frame feedback (PS2 / Shadow of the Colossus style): last frame's blurred image, reprojected for the
//     camera, is blended in (POST.uMotionTrail, 0..0.9), so anything moving on screen leaves a smear trail.
//
// Settings: POST_CFG (before the Game exists, or URL ?res=240 / ?res=0 for native, ?mb=0, ?dither=0) or at
// runtime post.setLowRes(h). RETRO (src/gfx/retro.ts) gets the internal size for vertex snapping.
import * as THREE from 'three';
import { UW } from './shaders/underwater';
import { SURF, FRONT_Z } from './water/surface';
import { NOISE_GLSL } from './sky';
import { RETRO } from './retro';

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
  uSaturation: { value: 1.0 },
  uContrast: { value: 1.06 },
  uGradeLift: { value: new THREE.Vector3(0.0, 0.008, 0.02) },
  uGain: { value: new THREE.Vector3(1.03, 1.0, 0.97) },
  uVignette: { value: 0.5 },
  uChroma: { value: 0.0006 },
  uBloom: { value: 0.5 },
  uBloomThreshold: { value: 0.9 },
  uFlash: { value: new THREE.Vector4(1, 1, 1, 0) }, // rgb + amount (hit flashes, ability flashes)
  uDesat: { value: 0 },          // e.g. when dragged up / low health
  uPulse: { value: 0 },          // red heartbeat vignette 0..1
  uUnderwaterPost: { value: 1 }, // 0 disables the water optics (map / backpack / hideout scenes)
  // ---- retro cinematic additions
  /** camera motion blur shutter: 0 off, 1 = a frame's worth of motion, 2+ = heavy */
  uMotionBlur: { value: 2.0 },
  /** max blur length as a fraction of the screen */
  uMotionMax: { value: 0.07 },
  /** reprojected frame feedback (motion trails on anything moving), 0..0.9, at 60 fps */
  uMotionTrail: { value: 0.45 },
  /** cinematic bars 0..1 (1 = 2.39:1 scope) */
  uLetterbox: { value: 0 },
  /** fade to uFadeCol 0..1 (applied before the dither, so fades are dithered like a PS1 fade) */
  uFade: { value: 0 },
  uFadeCol: { value: new THREE.Color('#000000') },
  /** ordered-dither colour quantise on/off and bits per channel (5 = PS1 15-bit) */
  uDither: { value: 1 },
  uColorBits: { value: 5 },
  /** film grain amount */
  uGrain: { value: 0.04 },
  /** split tone: shadows toward uSplitLo (teal), highlights toward uSplitHi (amber) */
  uSplit: { value: 0.32 },
  uSplitLo: { value: new THREE.Color('#1d5a66') },
  uSplitHi: { value: new THREE.Color('#ffb46a') },
  /** black crush (display-space black point) */
  uBlack: { value: 0.03 },
  /** distance fog for dry scenes (uUnderwaterPost = 0): colour + density per metre (0 = off) */
  uDryFog: { value: 0 },
  uDryFogCol: { value: new THREE.Color('#0d0f14') },
};

const urlQ = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
/** pipeline config read when the Post is built / resized */
export const POST_CFG = {
  /** internal render height in pixels (0 = native resolution) */
  lowResH: urlQ.has('res') ? Number(urlQ.get('res')) : 360,
  /** MSAA samples on the scene target (0 = authentic jaggies) */
  msaa: 0,
  /** keep blur length / trail decay frame-rate independent (false: per-frame values, for slow capture) */
  fpsNormalize: urlQ.get('mbref') !== '0',
};
if (urlQ.get('mb') === '0') { POST.uMotionBlur.value = 0; POST.uMotionTrail.value = 0; }
if (urlQ.get('dither') === '0') POST.uDither.value = 0;

const UW_FS = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform float uNear; uniform float uFar;
uniform float uTime; uniform vec3 uSunDir; uniform float uWaterY; uniform float uFrontZ;
uniform sampler2D uLift; uniform vec2 uLiftBox; uniform vec4 uSwell[3];
uniform vec3 uScatterTop; uniform vec3 uScatterDeep; uniform vec3 uExt; uniform float uClear; uniform float uScatterDepthK;
uniform float uRays; uniform vec3 uRayCol; uniform float uWobble; uniform float uUnderwaterPost;
uniform float uDryFog; uniform vec3 uDryFogCol;
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
  vec2 q = vec2(p.x - p.y * uSunDir.x / uSunDir.y, p.z - p.y * uSunDir.z / uSunDir.y);
  vec2 sp = vec2(q.x * 0.33 + uTime * 0.035, q.y * 0.12);
  float n = vnoise(sp) * 0.57 + vnoise(sp * 2.03 + 1.7) * 0.29 + vnoise(sp * 4.1 + 9.2) * 0.14;
  float n2 = vnoise(vec2(q.x * 1.4 - uTime * 0.11, q.y * 0.5));
  float s = smoothstep(0.5, 0.8, n) * (0.55 + 0.45 * n2);
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
  if (uUnderwaterPost < 0.5) {
    vec3 col = texture(tColor, uv).rgb;
    if (uDryFog > 0.0 && d < 0.99999) col = mix(col, uDryFogCol, 1.0 - exp(-uDryFog * tHit));
    fragColor = vec4(col, 1.0); return;
  }
  vec3 C = uCamPos;
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
      vec3 pe = C + dir * ts; ts = t0 + (waterH(pe.x, pe.z) - p0.y) / dir.y;
      t1 = min(t1, max(ts, t0));
    }
  }
  float path = max(0.0, min(t1, 400.0) - t0);
  bool seenThrough = path > 0.0;
  bool exitsUp = seenThrough && t1 < tHit - 0.01;
  vec2 wob = vec2(0.0);
  if (seenThrough) {
    vec3 hp = C + dir * min(tHit, 60.0);
    float k = exitsUp ? 0.012 : 0.0016 * clamp(path / 20.0, 0.25, 1.0);
    wob = vec2(vnoise(hp.xy * 1.3 + uTime * 0.6) - 0.5, vnoise(hp.yx * 1.1 - uTime * 0.5 + 7.0) - 0.5) * k * uWobble;
  }
  vec3 col = texture(tColor, uv + wob).rgb;
  if (seenThrough) {
    float lp = max(0.0, path - uClear);
    vec3 T = exp(-uExt * lp);
    float avgDepth = max(0.0, uWaterY - (C + dir * (t0 + min(path, 60.0) * 0.5)).y);
    vec3 scat = mix(uScatterTop, uScatterDeep, 1.0 - exp(-avgDepth * uScatterDepthK));
    scat *= 1.0 + 0.35 * max(dir.y, 0.0);
    col = col * T + scat * (1.0 - T);
    if (uRays > 0.0) {
      float L = min(path, 70.0);
      float acc = 0.0;
      float jitter = nhash(uv * 731.7 + fract(uTime * 7.0));
      for (int i = 0; i < 7; i++) {
        float s = t0 + (float(i) + jitter) / 7.0 * L;
        vec3 p = C + dir * s;
        float dep = uWaterY - p.y;
        if (dep < 0.0) continue;
        float att = exp(-dep * 0.06) * exp(-max(0.0, s - t0 - uClear) * 0.03);
        acc += shaft(p) * att;
      }
      col += uRayCol * acc / 7.0 * min(L, 40.0) * 0.045 * uRays * mix(vec3(1.0), uScatterTop * 1.6, 0.35);
    }
  }
  fragColor = vec4(col, 1.0);
}`;

const BAYER_GLSL = /* glsl */ `
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
`;

// camera motion blur along reprojected velocity + reprojected frame feedback
const MB_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform sampler2D tHist;
uniform mat4 uReproj; uniform float uNear; uniform float uFar;
uniform float uMotionBlur; uniform float uMotionMax; uniform float uTrailK; uniform float uDtScale; uniform vec2 uRes;
${BAYER_GLSL}
float linDepth(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
void main() {
  float d = texture(tDepth, vUv).r;
  vec4 pp = uReproj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec2 prevUv = pp.w > 0.0 ? pp.xy / pp.w * 0.5 + 0.5 : vUv;
  vec2 v = (vUv - prevUv) * uMotionBlur * uDtScale;
  float L = length(v);
  if (L > uMotionMax) v *= uMotionMax / L;
  vec3 c0 = texture(tColor, vUv).rgb;
  vec3 col = c0;
  float lpx = length(v * uRes);
  if (lpx > 0.75) {
    const int N = 10;
    float zc = linDepth(d);
    float j = bayer4(gl_FragCoord.xy) - 0.5;
    vec3 acc = c0; float wsum = 1.0;
    for (int i = 0; i < N; i++) {
      float t = (float(i) + 0.5 + j) / float(N) - 0.5;
      vec2 u2 = clamp(vUv + v * t, vec2(0.0), vec2(1.0));
      float zs = linDepth(texture(tDepth, u2).r);
      // keep sharp foreground silhouettes from smearing far onto the background behind them
      float w = zs < zc - 0.6 - zc * 0.05 ? 0.35 : 1.0;
      acc += texture(tColor, u2).rgb * w; wsum += w;
    }
    col = acc / wsum;
  }
  // feedback trail: the previous (already blurred) frame, reprojected for the camera
  if (uTrailK > 0.0) {
    vec2 hu = prevUv;
    if (hu.x > 0.0 && hu.y > 0.0 && hu.x < 1.0 && hu.y < 1.0) {
      vec3 h = texture(tHist, hu).rgb;
      // fireflies (bloom-hot pixels) trail less so lights don't leave streak walls
      float k = uTrailK * (1.0 - 0.5 * smoothstep(3.0, 8.0, max(h.r, max(h.g, h.b))));
      col = mix(col, h, k);
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
  float k = smoothstep(uThreshold, uThreshold + 0.7, l);
  fragColor = vec4(min(c * k, vec3(12.0)), 1.0);
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

// filmic tonemap + grade + grain + dither, at the low internal resolution
const FINAL_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform sampler2D tBloom; uniform float uBloom; uniform float uExposure; uniform float uSaturation; uniform float uContrast;
uniform vec3 uGradeLift; uniform vec3 uGain; uniform float uVignette; uniform float uChroma; uniform float uTime; uniform vec4 uFlash; uniform float uDesat; uniform float uPulse;
uniform vec2 uRes;
uniform float uLetterbox; uniform float uFade; uniform vec3 uFadeCol; uniform float uDither; uniform float uColorBits; uniform float uGrain;
uniform float uSplit; uniform vec3 uSplitLo; uniform vec3 uSplitHi; uniform float uBlack;
${BAYER_GLSL}
// ACES fitted (Stephen Hill): filmic shoulder, hue-preserving-ish, no neon clipping
vec3 rrtOdt(vec3 v) { vec3 a = v * (v + 0.0245786) - 0.000090537; vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081; return a / b; }
vec3 acesFit(vec3 c) {
  const mat3 I = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 O = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  return clamp(O * rrtOdt(I * c), 0.0, 1.0);
}
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  // chromatic aberration in whole low-res pixels (stays crisp)
  vec2 off = floor(cc * r2 * uChroma * 18.0 * uRes + 0.5) / uRes;
  vec3 col;
  col.r = texture(tSrc, uv + off).r;
  col.g = texture(tSrc, uv).g;
  col.b = texture(tSrc, uv - off).b;
  col += texture(tBloom, uv).rgb * uBloom;
  col *= uExposure * 1.3;
  col = acesFit(col);
  col = pow(col, vec3(1.0 / 2.2));
  // grade: lift / gain, saturation, contrast around mid grey
  col = col * uGain + uGradeLift * (1.0 - col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation * (1.0 - uDesat * 0.8));
  col = (col - 0.5) * uContrast + 0.5;
  // split tone (teal shadows / amber highlights), soft-light style so neutrals stay neutral-ish
  l = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
  vec3 tone = mix(uSplitLo, uSplitHi, smoothstep(0.08, 0.75, l));
  vec3 tl = tone / max(dot(tone, vec3(0.299, 0.587, 0.114)), 1e-3);
  col = mix(col, col * tl, uSplit * (1.0 - abs(l - 0.45) * 0.9));
  // crushed blacks (but a floor so it stays readable)
  col = max(col - uBlack, 0.0) / (1.0 - uBlack);
  // vignette + heartbeat pulse + flashes
  float v = smoothstep(0.9, 0.18, r2 * 1.7);
  col *= mix(1.0, v, uVignette);
  col = mix(col, vec3(0.5, 0.0, 0.03), uPulse * smoothstep(0.1, 0.5, r2) * 0.6);
  col = mix(col, uFlash.rgb, uFlash.a);
  // film grain at the low-res pixel (animated on 24 fps cadence), stronger in the shadows / mids
  float gt = floor(uTime * 24.0);
  float g = h12(gl_FragCoord.xy + gt * vec2(37.0, 17.0)) + h12(gl_FragCoord.xy * 1.37 - gt * 11.0) - 1.0;
  float gl = dot(col, vec3(0.299, 0.587, 0.114));
  col += g * uGrain * (0.35 + 0.65 * (1.0 - gl)) * (0.25 + gl * 1.3);
  // fade (dithered like a PS1 fade-out)
  col = mix(col, uFadeCol, uFade);
  // cinematic bars
  float bar = uLetterbox * max(0.0, 1.0 - (uRes.x / uRes.y) / 2.39) * 0.5;
  if (vUv.y < bar || vUv.y > 1.0 - bar) col = vec3(0.0);
  // ordered-dither quantise to uColorBits per channel
  col = clamp(col, 0.0, 1.0);
  float lv = exp2(uColorBits) - 1.0;
  if (uDither > 0.5) col = floor(col * lv + bayer4(gl_FragCoord.xy)) / lv;
  else col = floor(col * 255.0 + 0.5) / 255.0;
  fragColor = vec4(col, 1.0);
}`;

// integer nearest upscale to the canvas
const BLIT_FS = /* glsl */ `
precision highp float; in vec2 vUv; out vec4 fragColor;
uniform sampler2D tSrc; uniform float uK; uniform vec2 uSrcRes;
void main() {
  ivec2 p = ivec2(min(floor(gl_FragCoord.xy / uK), uSrcRes - 1.0));
  fragColor = vec4(texelFetch(tSrc, p, 0).rgb, 1.0);
}`;

function fsMat(fs: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: FS_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
}
const hdrRT = (filter: THREE.MagnificationTextureFilter = THREE.LinearFilter) =>
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: filter, magFilter: filter });

export class Post {
  renderer: THREE.WebGLRenderer;
  sceneRT: THREE.WebGLRenderTarget;
  uwRT: THREE.WebGLRenderTarget;
  /** ping-pong motion-blurred HDR frames (current + history) */
  mbRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  /** the final graded, dithered low-res frame */
  outRT: THREE.WebGLRenderTarget;
  bloomDown: THREE.WebGLRenderTarget[] = [];
  bloomUp: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private qScene = new THREE.Scene();
  private qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private uwMat: THREE.ShaderMaterial;
  private mbMat: THREE.ShaderMaterial;
  private brightMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private finalMat: THREE.ShaderMaterial;
  private blitMat: THREE.ShaderMaterial;
  private black: THREE.DataTexture;
  /** internal (low-res) size */
  w = 1; h = 1;
  /** native drawing-buffer size and the integer upscale factor */
  nativeW = 1; nativeH = 1; k = 1;
  scale = 1;
  /** internal render height (0 = native); change with setLowRes() */
  lowResH = POST_CFG.lowResH;
  private sizeArgs: [number, number, number] = [1, 1, 1];
  private prevVP = new THREE.Matrix4();
  private curVP = new THREE.Matrix4();
  private lastScene: THREE.Scene | null = null;
  private lastCam: THREE.Camera | null = null;
  private lastT = 0;
  private cur = 0;
  private histValid = false;

  constructor(renderer: THREE.WebGLRenderer, low = false) {
    this.renderer = renderer;
    void low;
    const depthTexture = new THREE.DepthTexture(1, 1);
    depthTexture.type = THREE.FloatType;
    // nearest: refraction wobble shifts whole low-res pixels (crisp, PS2-style) instead of bilinear smearing
    this.sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: POST_CFG.msaa, depthTexture, depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.uwRT = hdrRT();
    this.mbRT = [hdrRT(), hdrRT()];
    this.outRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    for (let i = 0; i < 6; i++) {
      this.bloomDown.push(hdrRT());
      this.bloomUp.push(hdrRT());
    }
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.uwMat = fsMat(UW_FS, {
      tColor: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uTime: UW.uTime, uSunDir: UW.uSunDir, uWaterY: UW.uWaterY,
      uFrontZ: { value: FRONT_Z }, uLift: SURF.uLift, uLiftBox: SURF.uLiftBox, uSwell: SURF.uSwell,
      ...POST,
    });
    this.mbMat = fsMat(MB_FS, {
      tColor: { value: null }, tDepth: { value: null }, tHist: { value: null }, uReproj: { value: new THREE.Matrix4() },
      uNear: { value: 0.1 }, uFar: { value: 1000 }, uTrailK: { value: 0 }, uDtScale: { value: 1 }, uRes: { value: new THREE.Vector2() },
      uMotionBlur: POST.uMotionBlur, uMotionMax: POST.uMotionMax,
    });
    this.brightMat = fsMat(BRIGHT_FS, { tSrc: { value: null }, uThreshold: POST.uBloomThreshold });
    this.downMat = fsMat(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = fsMat(UP_FS, { tSrc: { value: null }, tPrev: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1.0 } });
    this.finalMat = fsMat(FINAL_FS, { tSrc: { value: null }, tBloom: { value: null }, uTime: UW.uTime, uRes: { value: new THREE.Vector2() }, ...POST });
    this.blitMat = fsMat(BLIT_FS, { tSrc: { value: null }, uK: { value: 1 }, uSrcRes: { value: new THREE.Vector2(1, 1) } });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.uwMat);
    this.quad.frustumCulled = false;
    this.qScene.add(this.quad);
  }

  /** change the internal render height at runtime (0 = native resolution) */
  setLowRes(h: number) { this.lowResH = Math.max(0, Math.round(h)); this.setSize(...this.sizeArgs); }

  setSize(w: number, h: number, pixelRatio: number) {
    this.sizeArgs = [w, h, pixelRatio];
    const NW = Math.max(1, Math.floor(w * pixelRatio * this.scale)), NH = Math.max(1, Math.floor(h * pixelRatio * this.scale));
    this.nativeW = NW; this.nativeH = NH;
    // integer upscale factor so every low-res pixel is an exact k x k block on screen
    const k = this.lowResH > 0 && NH > this.lowResH * 1.25 ? Math.max(1, Math.round(NH / this.lowResH)) : 1;
    const W = Math.ceil(NW / k), H = Math.ceil(NH / k);
    this.k = k; this.w = W; this.h = H;
    this.sceneRT.setSize(W, H);
    this.uwRT.setSize(W, H);
    this.mbRT[0].setSize(W, H); this.mbRT[1].setSize(W, H);
    this.outRT.setSize(W, H);
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < this.bloomDown.length; i++) {
      this.bloomDown[i].setSize(Math.max(1, bw), Math.max(1, bh));
      this.bloomUp[i].setSize(Math.max(1, bw), Math.max(1, bh));
      bw >>= 1; bh >>= 1;
    }
    this.finalMat.uniforms.uRes.value.set(W, H);
    this.mbMat.uniforms.uRes.value.set(W, H);
    this.blitMat.uniforms.uK.value = k;
    this.blitMat.uniforms.uSrcRes.value.set(W, H);
    RETRO.uRes.value.set(W, H);
    this.histValid = false;
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.qScene, this.qCam);
  }

  /** drop motion history (call on hard cuts so the previous shot doesn't ghost into the new one) */
  cut() { this.histValid = false; }

  private anims: { u: { value: number }; from: number; to: number; t: number; dur: number }[] = [];
  private animate(u: { value: number }, to: number, sec: number) {
    this.anims = this.anims.filter((a) => a.u !== u);
    if (sec <= 0) { u.value = to; return; }
    this.anims.push({ u, from: u.value, to, t: 0, dur: sec });
  }
  /** slide the cinematic bars in (1) / out (0) over sec seconds */
  letterboxTo(v: number, sec = 0.6) { this.animate(POST.uLetterbox, v, sec); }
  /** fade to colour (1) / back in (0) over sec seconds; dithered like a PS1 fade */
  fadeTo(v: number, sec = 0.8, color?: THREE.ColorRepresentation) { if (color !== undefined) POST.uFadeCol.value.set(color); this.animate(POST.uFade, v, sec); }
  private stepAnims(dt: number) {
    for (const a of this.anims) { a.t = Math.min(a.dur, a.t + dt); const k = a.t / a.dur; a.u.value = a.from + (a.to - a.from) * k * k * (3 - 2 * k); }
    this.anims = this.anims.filter((a) => a.t < a.dur);
  }

  /** render the world scene through the full chain, then overlays (no post) on top */
  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, overlays: { scene: THREE.Scene; camera: THREE.Camera }[] = []) {
    const r = this.renderer;
    const now = performance.now();
    const dt = this.lastT ? Math.min(0.25, Math.max(1 / 240, (now - this.lastT) / 1000)) : 1 / 60;
    this.lastT = now;
    if (scene !== this.lastScene || camera !== this.lastCam) { this.histValid = false; this.lastScene = scene; this.lastCam = camera; }
    if (this.anims.length) this.stepAnims(dt);
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);
    // underwater optics / dry fog
    const u = this.uwMat.uniforms;
    u.tColor.value = this.sceneRT.texture;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.uInvProj.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    u.uNear.value = camera.near; u.uFar.value = camera.far;
    this.pass(this.uwMat, this.uwRT);
    // motion blur + frame feedback
    this.curVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const cur = this.mbRT[this.cur], hist = this.mbRT[1 - this.cur];
    const m = this.mbMat.uniforms;
    m.tColor.value = this.uwRT.texture;
    m.tDepth.value = this.sceneRT.depthTexture;
    m.tHist.value = hist.texture;
    m.uNear.value = camera.near; m.uFar.value = camera.far;
    if (!this.histValid) this.prevVP.copy(this.curVP);
    m.uReproj.value.copy(this.prevVP).multiply(new THREE.Matrix4().copy(this.curVP).invert());
    const norm = POST_CFG.fpsNormalize;
    m.uDtScale.value = norm ? THREE.MathUtils.clamp(1 / 60 / dt, 0.35, 1.5) : 1;
    const trail = THREE.MathUtils.clamp(POST.uMotionTrail.value, 0, 0.92);
    m.uTrailK.value = this.histValid ? (norm ? Math.pow(trail, dt * 60) : trail) : 0;
    this.pass(this.mbMat, cur);
    this.prevVP.copy(this.curVP);
    this.histValid = true;
    this.cur = 1 - this.cur;
    // bloom
    this.brightMat.uniforms.tSrc.value = cur.texture;
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
    // grade + dither at low res, then nearest upscale
    this.finalMat.uniforms.tSrc.value = cur.texture;
    this.finalMat.uniforms.tBloom.value = this.bloomUp[0].texture;
    this.pass(this.finalMat, this.outRT);
    this.blitMat.uniforms.tSrc.value = this.outRT.texture;
    this.pass(this.blitMat, null);
    // overlays straight to screen (full resolution, crisp UI)
    r.autoClear = false;
    for (const o of overlays) { r.clearDepth(); r.render(o.scene, o.camera); }
    r.autoClear = true;
  }
}
