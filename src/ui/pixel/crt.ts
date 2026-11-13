// CRT screen material: shows a pixel UI canvas as an old curved tube TV. Barrel curvature, sharp-bilinear
// sampling (pixels stay crisp at any non-integer scale), per-row scanlines, a soft phosphor glow, aperture
// grille, glass glare, vignette, rolling hum bar, static, and the power on/off collapse (line -> dot).
//
//   const m = crtMaterial(ui.texture, [320, 240], { overlay: true });   // overlay: output sRGB (no post)
//   m.uniforms.uPower.value = 0..1; m.uniforms.uStatic.value = 0..1; crtUv(u, v, curve) maps screen -> source uv
import * as THREE from 'three';

const VS = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const FS = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tSrc; uniform vec2 uSrcSize; uniform vec2 uOutSize; uniform float uTime;
uniform float uCurve; uniform float uPower; uniform float uStatic; uniform float uBright; uniform float uOverlay; uniform float uGlare; uniform float uRoll;
uniform vec3 uBlack;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 curve(vec2 uv) {
  vec2 c = uv * 2.0 - 1.0;
  c *= vec2(1.0 + c.y * c.y * uCurve, 1.0 + c.x * c.x * uCurve * 1.3);
  c /= 1.0 + uCurve * 0.9;
  return c * 0.5 + 0.5;
}
vec3 sharp(vec2 uv) {
  vec2 texel = uv * uSrcSize;
  vec2 sc = max(floor(uOutSize / uSrcSize), vec2(1.0));
  vec2 fl = floor(texel);
  vec2 cd = fract(texel) - 0.5;
  vec2 rr = 0.5 - 0.5 / sc;
  vec2 f = (cd - clamp(cd, -rr, rr)) * sc + 0.5;
  vec4 t = texture2D(tSrc, (fl + f) / uSrcSize);
  return mix(uBlack, t.rgb, t.a);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec2 uv = curve(vUv);
  // power collapse: horizontal line, then a dot
  float p = clamp(uPower, 0.0, 1.0);
  float sy = smoothstep(0.35, 1.0, p), sx = smoothstep(0.0, 0.35, p);
  vec2 q = uv - 0.5;
  q.y /= max(sy, 0.004); q.x /= max(sx, 0.004);
  vec2 suv = q + 0.5;
  vec3 col = uBlack;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  if (inside > 0.5 && p > 0.001) {
    float on = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
    // vertical hold slip on channel changes: the picture rolls with a black blanking bar
    float rolled = fract(suv.y + uRoll);
    float blank = uRoll > 0.0005 ? smoothstep(0.0, 0.03, rolled) * smoothstep(1.0, 0.97, rolled) : 1.0;
    suv.y = rolled;
    if (on > 0.5) {
      vec3 c = sharp(suv) * blank;
      // phosphor glow (cheap 4-tap blur, 1.5 source texels)
      vec2 o = 1.5 / uSrcSize;
      vec3 g = sharp(suv + vec2(o.x, 0.0)) + sharp(suv - vec2(o.x, 0.0)) + sharp(suv + vec2(0.0, o.y)) + sharp(suv - vec2(0.0, o.y));
      c += max(g * 0.25 - uBlack, 0.0) * 0.35;
      // scanlines: darken between source rows
      float ry = fract(suv.y * uSrcSize.y);
      float sl = 0.5 + 0.5 * cos((ry - 0.5) * 6.2831853);
      c *= mix(1.0, 0.62 + 0.38 * sl, 0.55);
      // aperture grille (screen space)
      float m = mod(floor(gl_FragCoord.x), 3.0);
      vec3 mask = m < 1.0 ? vec3(1.08, 0.96, 0.96) : m < 2.0 ? vec3(0.96, 1.08, 0.96) : vec3(0.96, 0.96, 1.08);
      c *= mix(vec3(1.0), mask, step(2.5, uOutSize.y / uSrcSize.y) * 0.8);
      // rolling hum bar + flicker
      float bar = smoothstep(0.0, 0.08, abs(fract(suv.y * 0.6 - uTime * 0.11) - 0.5));
      c *= 0.94 + 0.06 * bar;
      c *= 0.985 + 0.015 * sin(uTime * 61.0);
      // static
      float n = h12(floor(suv * uSrcSize) + floor(uTime * 30.0) * 7.31);
      c = mix(c, vec3(n * 0.9), uStatic);
      // turn-on bloom of the collapsing line
      c += vec3(0.9, 0.95, 1.0) * (1.0 - sy) * 2.0;
      col = c;
    }
    // vignette of the tube
    vec2 cc = uv * 2.0 - 1.0;
    float vig = 1.0 - dot(cc * cc, cc * cc) * 0.35;
    col *= vig;
    // glass glare (top-left) and a faint edge sheen
    float gl = smoothstep(0.55, 0.0, length((uv - vec2(0.24, 0.2)) * vec2(1.0, 1.5)));
    col += vec3(0.06, 0.08, 0.09) * gl * uGlare;
    float edge = smoothstep(0.86, 1.0, max(abs(cc.x), abs(cc.y)));
    col += vec3(0.03, 0.04, 0.05) * edge * uGlare;
    // a curved reflection arc across the top of the glass and a small hot specular
    float arc = smoothstep(0.008, 0.0, abs(length((uv - vec2(0.62, 1.55)) * vec2(0.8, 1.0)) - 0.95)) * smoothstep(0.7, 0.9, uv.y) * smoothstep(0.75, 0.35, abs(uv.x - 0.45));
    col += vec3(0.05, 0.06, 0.07) * arc * uGlare;
    col += vec3(0.12) * smoothstep(0.018, 0.0, length((uv - vec2(0.12, 0.9)) * vec2(1.0, 1.4))) * uGlare;
  } else {
    col = vec3(0.0);
  }
  // soft round tube edge
  vec2 e = abs(uv * 2.0 - 1.0);
  float edgeA = 1.0 - smoothstep(0.985, 1.0, max(e.x, e.y));
  col *= uBright;
  float a = 1.0;
  if (uOverlay > 0.5) { col = toSRGB(col); a = edgeA * inside; }
  else col *= edgeA * inside;
  gl_FragColor = vec4(col, a);
}`;

export type CrtMaterial = THREE.ShaderMaterial & { uniforms: Record<'tSrc' | 'uSrcSize' | 'uOutSize' | 'uTime' | 'uCurve' | 'uPower' | 'uStatic' | 'uBright' | 'uOverlay' | 'uGlare' | 'uBlack' | 'uRoll', THREE.IUniform> };

export function crtMaterial(tex: THREE.Texture, src: [number, number], o: { overlay?: boolean; curve?: number; bright?: number } = {}): CrtMaterial {
  const m = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS,
    uniforms: {
      tSrc: { value: tex }, uSrcSize: { value: new THREE.Vector2(src[0], src[1]) }, uOutSize: { value: new THREE.Vector2(src[0] * 3, src[1] * 3) },
      uTime: { value: 0 }, uCurve: { value: o.curve ?? 0.06 }, uPower: { value: 1 }, uStatic: { value: 0 }, uBright: { value: o.bright ?? 1 },
      uOverlay: { value: o.overlay ? 1 : 0 }, uGlare: { value: 1 }, uRoll: { value: 0 }, uBlack: { value: new THREE.Color('#0b120f').convertSRGBToLinear() },
    },
    transparent: !!o.overlay, depthTest: !o.overlay, depthWrite: !o.overlay, toneMapped: false,
  }) as CrtMaterial;
  return m;
}

/** the same barrel mapping the shader uses: screen uv (0..1, y up) -> source uv */
export function crtUv(u: number, v: number, curve: number): [number, number] {
  let cx = u * 2 - 1, cy = v * 2 - 1;
  const nx = cx * (1 + cy * cy * curve), ny = cy * (1 + cx * cx * curve * 1.3);
  cx = nx / (1 + curve * 0.9); cy = ny / (1 + curve * 0.9);
  return [cx * 0.5 + 0.5, cy * 0.5 + 0.5];
}
