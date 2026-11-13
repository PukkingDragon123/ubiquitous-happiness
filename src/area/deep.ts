// Life and light for the abyss:
//   lantern-fish - small dark fish in loose groups, a glowing lure lamp on a stalk and photophore dots along the
//                  belly; they drift, turn, and scatter with a bright flash when the blobfish comes near. The
//                  nearest lures borrow the lighting rig's pooled point lights (via scen.glowDyn);
//   giant isopods- armoured pill-bug scavengers plodding over the ooze, hunkering down when bothered;
//   vents        - crowds of white tube worms with glowing red plumes round every chimney, and a shimmering
//                  column of heat haze rising out of each;
//   a faint blue back light so silhouettes read against the black water.
import * as THREE from 'three';
import type { World } from '../game/types';
import type { Scenery } from './scenery';
import { Soup, V3, mat4, icosphere } from '../world/lp';
import { Rng } from '../core/rng';
import { clamp, damp, smooth } from '../core/math';
import { UW } from '../gfx/shaders/underwater';
import { Herd } from './critters';
import { TAU, critterSkin, rgb01 } from './kit';

type UVRect = { u0: number; v0: number; u1: number; v1: number };
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _m3 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _ax = new THREE.Vector3(), _v = new THREE.Vector3();

let FR = { u0: 0, v0: 0, u1: 1, v1: 1 };
function fin(s: Soup, a: V3, b: V3, c: V3) { const r = FR; s.tri(a, b, c, [r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1]); s.tri(a, c, b, [r.u0, r.v0], [r.u1, r.v1], [r.u1, r.v0]); }

/** lantern-fish body (nose +x, tail base at x = -0.13): dark back, silver flank, big eye, photophores, a lure */
function lanternBody(sk: UVRect) {
  const s = new Soup();
  const f = s.count;
  s.glow(0.22).color(0.36, 0.44, 0.6).tube([[-0.14, 0, 0], [-0.08, 0.004, 0], [-0.01, 0.008, 0], [0.06, 0.008, 0], [0.12, 0.004, 0], [0.16, -0.004, 0]], (t) => [0.02, 0.038, 0.052, 0.055, 0.046, 0.024][Math.min(5, Math.round(t * 5))], 6, sk, { base: true, tip: true, shade: (t) => 0.8 + t * 0.3 });
  s.transformSince(f, mat4(0, 0, 0, 1, 1, 0.72));
  s.glow(0.3).color(0.95, 1.02, 1.15).tube([[-0.1, -0.022, 0], [0.1, -0.026, 0]], () => 0.02, 4, sk, { shade: () => 1.1 });   // silver belly keel
  s.glow(0);
  s.color(0.04, 0.04, 0.06);
  for (const side of [-1, 1]) s.box([0.105, 0.0, side > 0 ? 0.03 : -0.042], [0.03, 0.03, 0.012], sk);          // big eyes
  s.color(0.25, 0.3, 0.42);
  fin(s, [0.0, 0.05, 0], [-0.07, 0.04, 0], [-0.05, 0.085, 0]);
  for (const side of [-1, 1]) fin(s, [0.07, -0.01, side * 0.03], [0.02, -0.03, side * 0.07], [0.04, 0.0, side * 0.06]);
  // photophores: a row of glowing dots down each flank
  s.glow(2.6).color(0.45, 0.95, 1.5);
  for (const side of [-1, 1]) for (let k = 0; k < 6; k++) s.box([-0.09 + k * 0.035, -0.03 + Math.sin(k) * 0.004, side > 0 ? 0.034 : -0.04], [0.012, 0.012, 0.006], sk);
  s.glow(0);
  // the lure: a stalk curling up over the snout to a glowing bulb
  s.color(0.3, 0.32, 0.4).tube([[0.1, 0.04, 0], [0.13, 0.1, 0], [0.18, 0.13, 0], [0.22, 0.115, 0]], (t) => 0.007 * (1 - t * 0.4), 3, sk);
  const ico = icosphere(1);
  s.glow(4.5).color(0.65, 1.2, 1.5);
  for (let q = 0; q < ico.i.length; q += 3) { const P = (i: number): V3 => [ico.p[i * 3] * 0.034 + 0.225, ico.p[i * 3 + 1] * 0.034 + 0.1, ico.p[i * 3 + 2] * 0.034]; s.tri(P(ico.i[q]), P(ico.i[q + 1]), P(ico.i[q + 2]), [sk.u0, sk.v0], [sk.u1, sk.v0], [sk.u1, sk.v1]); }
  s.glow(0);
  return s.geometry();
}
const LURE = new THREE.Vector3(0.225, 0.1, 0);
function lanternTail(sk: UVRect) {
  const s = new Soup();
  s.color(0.3, 0.36, 0.48).tube([[0.01, 0, 0], [-0.04, 0, 0]], (t) => 0.02 - t * 0.008, 5, sk);
  s.color(0.24, 0.3, 0.42);
  fin(s, [-0.035, 0, 0], [-0.11, 0.065, 0], [-0.085, 0.0, 0]);
  fin(s, [-0.035, 0, 0], [-0.085, 0.0, 0], [-0.11, -0.06, 0]);
  return s.geometry();
}

/** a giant isopod: overlapping arched plates, a rounded tail shield, eyes, long antennae (+x forward) */
function isopodBody(sk: UVRect) {
  const s = new Soup();
  const W = 0.11, Hh = 0.07;
  const arc = (x: number, k: number, y0 = 0.012): V3[] => { const out: V3[] = []; for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; out.push([x, y0 + Math.cos(a) * Hh * k, Math.sin(a) * W * k]); } return out; };
  const plate = (x0: number, x1: number, k0: number, k1: number, shade: number) => {
    const A = arc(x0, k0), B = arc(x1, k1), Bl = arc(x1 - 0.004, k1 * 1.07, 0.004);
    for (let i = 0; i < 8; i++) {
      s.quad(A[i], B[i], B[i + 1], A[i + 1], sk, [shade, shade, shade, shade]);
      const k = shade * 1.25;                                                                                 // the lit lip, both ways
      s.quad(B[i], Bl[i], Bl[i + 1], B[i + 1], sk, [k, k, k, k]); s.quad(Bl[i], B[i], B[i + 1], Bl[i + 1], sk, [k, k, k, k]);
    }
  };
  s.color(1, 1, 1);
  const segs = [[0.2, 0.17, 0.82, 0.92], [0.17, 0.12, 0.92, 1], [0.12, 0.07, 1, 1], [0.07, 0.02, 1, 1], [0.02, -0.03, 1, 1], [-0.03, -0.08, 1, 0.98], [-0.08, -0.12, 0.98, 0.94], [-0.12, -0.15, 0.94, 0.86], [-0.15, -0.175, 0.86, 0.78], [-0.175, -0.2, 0.78, 0.7]];
  segs.forEach(([x0, x1, k0, k1], i) => plate(x0, x1, k0, k1, i % 2 ? 0.86 : 1));
  // the head and the tail shield (pleotelson)
  const hf = s.count;
  s.lathe([[0.075, 0], [0.065, 0.025], [0.04, 0.045], [0, 0.05]], 7, sk, { sz: 1.2 });
  s.transformSince(hf, mat4(0.2, 0.012, 0, 1, 1, 1, 0, 0, -Math.PI / 2 + 0.25));
  const tf = s.count;
  s.lathe([[0.075, 0], [0.07, 0.02], [0.045, 0.05], [0, 0.065]], 7, sk, { sz: 1.15 });
  s.transformSince(tf, mat4(-0.2, 0.012, 0, 1, 0.6, 1, 0, 0, Math.PI / 2));
  for (const side of [-1, 1]) fin(s, [-0.2, 0.01, side * 0.05], [-0.28, 0.005, side * 0.09], [-0.24, 0.012, side * 0.03]);   // uropods
  s.color(0.06, 0.05, 0.08);
  for (const side of [-1, 1]) s.box([0.205, 0.03, side > 0 ? 0.035 : -0.06], [0.03, 0.025, 0.025], sk);
  s.color(0.8, 0.75, 0.8);
  for (const side of [-1, 1]) {
    s.tube([[0.24, 0.03, side * 0.03], [0.34, 0.05, side * 0.1], [0.42, 0.03, side * 0.17]], (t) => 0.006 * (1 - t * 0.6), 3, sk);
    s.tube([[0.25, 0.025, side * 0.015], [0.3, 0.04, side * 0.04]], () => 0.005, 3, sk);
  }
  return s.geometry();
}
function isopodLegs(sk: UVRect) {
  const s = new Soup();
  s.color(0.75, 0.7, 0.75);
  for (let k = 0; k < 7; k++) for (const side of [-1, 1]) {
    const x = 0.15 - k * 0.045;
    s.tube([[x, 0.02, side * 0.08], [x + 0.01, 0.03, side * 0.14], [x + 0.02, 0.0, side * 0.16]], () => 0.007, 3, sk, { tip: true });
  }
  return s.geometry();
}

/** tube worms: white chitin tubes with blood-red glowing plumes */
function wormClump(s: Soup, sk: UVRect, r: Rng, n: number, spread: number) {
  for (let k = 0; k < n; k++) {
    const a = r.range(0, TAU), d = Math.sqrt(r.next()) * spread, x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
    const H = r.range(0.35, 1.0) * (1.1 - d / spread * 0.5), lean = r.range(-0.15, 0.15), f = s.count;
    s.color(0.92, 0.9, 0.84).lathe([[0.04, 0], [0.035, H * 0.5], [0.032, H]], 5, sk, { jit: (j) => 1 + (j % 2) * 0.1 });
    s.glow(1.6).color(1.5, 0.22, 0.18).lathe([[0.03, H], [0.07, H + 0.05], [0.06, H + 0.12], [0, H + 0.14]], 5, sk).glow(0);
    s.transformSince(f, mat4(x, 0, z, 1, 1, 1, r.range(0, TAU), lean, -lean));
  }
}

// ------------------------------------------------------------------ the abyss
interface Lantern { i: number; x: number; y: number; z: number; vx: number; vy: number; yaw: number; ph: number; g: number; flash: number; s: number; ox: number; oy: number }
interface Pod { i: number; x: number; y: number; z: number; hx: number; v: number; dir: number; t: number; ph: number; hunker: number; s: number; walk: boolean }

export class Deep {
  group = new THREE.Group();
  private body: Herd; private tail: Herd;
  private podB: Herd; private podL: Herd;
  private fish: Lantern[] = [];
  private schools: { x: number; y: number; z: number; hx: number; ph: number; r: number }[] = [];
  private pods: Pod[] = [];
  private back = new THREE.DirectionalLight('#6a9aff', 1.7);
  /** pixel halos round the lure lamps (one point per fish, written every frame) */
  private halo: THREE.Points; private haloPos: Float32Array; private haloK: Float32Array;
  private hazeMat: THREE.ShaderMaterial | null = null;
  private r: Rng;
  private t = 0;
  private scareX = 0; private scareY = -999; private scareT = 0;

  constructor(public scen: Scenery, public w: World, seed: number) {
    const r = (this.r = new Rng(seed ^ 0xdee9)), sh = scen.shape, P = scen.props, sk = critterSkin(P.A), mat = scen.mats.prop;
    FR = sk;
    // ---- lantern-fish
    const nSch = 10, per = 4, N = nSch * per;
    this.body = new Herd(lanternBody(sk), mat, N, 'lanternfish');
    this.tail = new Herd(lanternTail(sk), mat, N, 'lanternfish-tail');
    for (let k = 0; k < nSch; k++) {
      const x = sh.X0 + 10 + (k + r.range(0.1, 0.9)) * ((sh.X1 - sh.X0 - 20) / nSch), deep = k % 4 === 3;
      const z = deep ? r.range(-6, -3) : r.range(-1.2, 1.0), fl = scen.sand.heightAt(x);
      this.schools.push({ x, y: r.range(fl + 2.5, Math.min(-6, fl + 9)), z, hx: x, ph: r.range(0, 10), r: r.range(0.8, 1.4) });
      for (let i = 0; i < per; i++) {
        const sc = this.schools[k];
        this.fish.push({ i: this.fish.length, x: sc.x + r.range(-1, 1), y: sc.y + r.range(-0.5, 0.5), z: sc.z + r.range(-0.4, 0.4), vx: r.range(-0.3, 0.3), vy: 0, yaw: 0, ph: r.range(0, 10), g: k, flash: 0, s: r.range(0.95, 1.35), ox: r.range(-1, 1), oy: r.range(-0.5, 0.5) });
      }
    }
    // ---- giant isopods
    const nP = 9;
    this.podB = new Herd(isopodBody(sk), mat, nP, 'isopods');
    this.podL = new Herd(isopodLegs(sk), mat, nP, 'isopod-legs');
    for (let i = 0; i < nP; i++) {
      const x = r.range(sh.X0 + 8, sh.X1 - 8), z = i < 6 ? r.range(-2.4, 0.9) : r.range(-7, -3.5);
      this.pods.push({ i, x, y: scen.heightAt(x, z), z, hx: x, v: r.range(0.08, 0.16), dir: r.sign(), t: r.range(0, 5), ph: r.range(0, 10), hunker: 0, s: r.range(1.0, 1.45), walk: r.chance(0.5) });
      this.podB.color(i, rgb01(r.pick(['#c8b0d0', '#d8c0c0', '#b8a8d0']), 1.35));
      this.podL.color(i, rgb01('#c0b0c0', 1.2));
    }
    for (const h of [this.body, this.tail, this.podB, this.podL]) this.group.add(h.mesh);
    this.haloPos = new Float32Array(N * 3).fill(-999); this.haloK = new Float32Array(N);
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(this.haloPos, 3).setUsage(THREE.DynamicDrawUsage));
    hg.setAttribute('aK', new THREE.BufferAttribute(this.haloK, 1).setUsage(THREE.DynamicDrawUsage));
    const hm = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: w.game.h * Math.min(devicePixelRatio || 1, 1.5) / (2 * Math.tan((w.camera.fov * Math.PI) / 360)) }, uT: UW.uTime },
      vertexShader: /* glsl */ `attribute float aK; uniform float uScale; uniform float uT; varying float vK;
        void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; vK = aK * (0.85 + 0.15 * sin(uT * 3.0 + position.x * 5.0));
          gl_PointSize = max(3.0, floor(0.26 * uScale / -mv.z * (0.8 + aK * 0.4))); }`,
      fragmentShader: /* glsl */ `varying float vK;
        void main() { vec2 d = abs(gl_PointCoord - 0.5) * 2.0; float r = d.x + d.y;   // a pixel diamond: hot core, cool ring
          if (r > 1.0 || vK < 0.02) discard;
          vec3 c = r < 0.35 ? vec3(0.8, 1.0, 1.0) : r < 0.7 ? vec3(0.25, 0.7, 0.85) : vec3(0.06, 0.22, 0.3);
          gl_FragColor = vec4(c * vK, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Points(hg, hm);
    this.halo.frustumCulled = false; this.halo.renderOrder = 13;
    this.group.add(this.halo);
    scen.disposables.push(hg, hm);
    // ---- vents: tube-worm crowds and heat haze
    const hz: number[] = [], hu: number[] = [], hi: number[] = [];
    for (const v of scen.vents) {
      const base = scen.heightAt(v.x, v.z) - 0.05;
      for (let c = 0; c < 3; c++) {
        const s = new Soup(), a = (c / 3) * TAU + r.range(0, 1), d = r.range(0.7, 1.4);
        wormClump(s, sk, r, r.int(7, 12), 0.45);
        const cx = v.x + Math.cos(a) * d, cz = v.z + Math.sin(a) * d * 0.7;
        scen.chunk(cx).prop.append(s, mat4(cx, scen.heightAt(cx, cz) - 0.05, cz, 1, 1, 1));
      }
      scen.glowPts.push({ x: v.x + 0.8, y: base + 0.6, z: v.z + 0.9, col: '#ff4a3a' });
      // a camera-facing column of shimmer above the throat
      const k0 = hz.length / 3, W = 0.9, Hh = 4.2;
      for (const [u, vv] of [[0, 0], [1, 0], [1, 1], [0, 1]]) { hz.push(v.x + (u - 0.5) * W * (1 + vv * 1.6), v.y + 0.1 + vv * Hh, v.z + 0.35); hu.push(u, vv); }
      hi.push(k0, k0 + 1, k0 + 2, k0, k0 + 2, k0 + 3);
    }
    if (hz.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(hz, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2));
      g.setIndex(hi);
      this.hazeMat = new THREE.ShaderMaterial({
        uniforms: { uT: UW.uTime },
        vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uT; varying vec2 vUv;
          void main() {
            float y = vUv.y, x = vUv.x - 0.5;
            // wavering refraction bands rising out of the throat: thin crisp lines, no gradients
            float wob = sin(y * 9.0 - uT * 3.1 + sin(y * 4.0 + uT * 1.7) * 1.8) * 0.12 * (0.3 + y);
            float band = sin((y * 26.0 - uT * 7.0) + sin((x + wob) * 14.0 + uT * 2.3) * 2.2);
            float lines = step(0.93, band);
            float mask = (1.0 - smoothstep(0.18, 0.5, abs(x + wob))) * (1.0 - smoothstep(0.55, 1.0, y)) * smoothstep(0.0, 0.08, y);
            float k = lines * mask;
            if (k <= 0.0) discard;
            vec3 col = mix(vec3(1.0, 0.7, 0.45), vec3(0.6, 0.7, 0.85), y) * 0.13;
            gl_FragColor = vec4(col * k, 1.0);
          }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(g, this.hazeMat);
      m.frustumCulled = false; m.renderOrder = 13;
      this.group.add(m);
      scen.disposables.push(g);
    }
    // ---- a faint blue light from behind and above: rims every silhouette against the dark
    this.back.position.set(0, 12, -40);
    this.group.add(this.back, this.back.target);
    this.group.name = 'deep';
    this.update(0, 0, true);
    scen.glowDyn.length = 0;
  }

  scare(x: number, y: number, r: number) { this.scareX = x; this.scareY = y; this.scareT = 0.8 + r * 0.05; }

  update(dt: number, camX: number, all = false) {
    this.t += dt;
    const w = this.w, p = w.player, scen = this.scen;
    this.scareT = Math.max(0, this.scareT - dt);
    this.back.position.set(camX + 8, 6, -36);
    this.back.target.position.set(camX, -22, 4);
    this.back.target.updateMatrixWorld();
    // ---- schools wander, fish follow loosely
    for (const sc of this.schools) {
      sc.ph += dt;
      sc.x = sc.hx + Math.sin(sc.ph * 0.07) * 9;
      const fl = scen.sand.heightAt(sc.x);
      sc.y = clamp(sc.y + Math.sin(sc.ph * 0.23) * dt * 0.3, fl + 1.6, -5);
    }
    scen.glowDyn.length = 0;
    for (const f of this.fish) {
      if (!all && Math.abs(f.x - camX) > 20) continue;
      const sc = this.schools[f.g];
      f.ph += dt;
      const tx = sc.x + f.ox * sc.r * 1.6 + Math.sin(f.ph * 0.5) * 0.6, ty = sc.y + f.oy * sc.r + Math.sin(f.ph * 0.7) * 0.3;
      let ax = (tx - f.x) * 0.5, ay = (ty - f.y) * 0.5;
      const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy) + Math.abs(f.z) * 0.3;
      const sx = f.x - this.scareX, sy = f.y - this.scareY, sd = Math.hypot(sx, sy);
      if (d < 2.6) { const k = (2.6 - d) * 6; ax += (dx / (d || 1)) * k; ay += (dy / (d || 1)) * k; f.flash = Math.max(f.flash, 1); }
      if (this.scareT > 0 && sd < 7) { ax += (sx / (sd || 1)) * 8; ay += (sy / (sd || 1)) * 8; f.flash = 1; }
      f.vx += ax * dt; f.vy += ay * dt;
      const sp = Math.hypot(f.vx, f.vy), max = f.flash > 0.3 ? 3.2 : 0.6;
      if (sp > max) { f.vx *= max / sp; f.vy *= max / sp; }
      f.vx = damp(f.vx, f.vx * 0.6, 1, dt); f.vy = damp(f.vy, f.vy * 0.6, 1, dt);
      f.x += f.vx * dt; f.y += f.vy * dt;
      const fl = scen.sand.heightAt(f.x);
      if (f.y < fl + 0.5) { f.y = fl + 0.5; f.vy = Math.abs(f.vy); }
      if (f.y > -1.5) f.vy -= dt * 2;
      f.flash = Math.max(0, f.flash - dt * 1.3);
      // face the way it swims, slowly; tail beats faster when fleeing
      const want = f.vx >= 0 ? 0 : Math.PI;
      f.yaw = damp(f.yaw, want, 3, dt);
      const pitch = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 0.2), -0.5, 0.5);
      _q.setFromAxisAngle(_ax.set(0, 1, 0), f.yaw).multiply(_qa.setFromAxisAngle(_ax.set(0, 0, 1), pitch));
      _m.compose(_p.set(f.x, f.y, f.z), _q, _s.set(f.s, f.s, f.s));
      this.body.setM(f.i, _m);
      const beat = Math.sin(f.ph * (f.flash > 0.3 ? 22 : 7)) * (f.flash > 0.3 ? 0.6 : 0.35);
      _m2.makeTranslation(-0.13, 0, 0).multiply(_m3.makeRotationY(beat));
      this.tail.setM(f.i, _m2.premultiply(_m));
      const br = 1 + f.flash * 0.6;
      this.body.color(f.i, [br, br, br]);
      _v.copy(LURE).applyMatrix4(_m);
      this.haloPos[f.i * 3] = _v.x; this.haloPos[f.i * 3 + 1] = _v.y; this.haloPos[f.i * 3 + 2] = _v.z;
      this.haloK[f.i] = 0.75 + f.flash * 0.6;
      if (Math.abs(f.x - camX) < 12) scen.glowDyn.push({ x: _v.x, y: _v.y + 0.2, z: _v.z + 1.0, col: '#7cf8ff', k: 0.4 + f.flash * 0.35 });
    }
    this.body.commit(); this.tail.commit();
    (this.halo.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.halo.geometry.attributes.aK as THREE.BufferAttribute).needsUpdate = true;
    // ---- isopods plod over the ooze
    for (const b of this.pods) {
      if (!all && Math.abs(b.x - camX) > 18) continue;
      b.t -= dt; b.ph += dt;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      const bothered = d < 1.6 || (this.scareT > 0 && Math.hypot(b.x - this.scareX, b.y - this.scareY) < 5);
      b.hunker = damp(b.hunker, bothered ? 1 : 0, bothered ? 8 : 1.2, dt);
      if (b.t <= 0) {
        b.walk = !b.walk; b.t = b.walk ? this.r.range(2, 8) : this.r.range(1, 5);
        if (b.walk) { if (Math.abs(b.x - b.hx) > 5) b.dir = Math.sign(b.hx - b.x); else if (this.r.chance(0.3)) b.dir = -b.dir; }
      }
      const walking = b.walk && !bothered && b.hunker < 0.3;
      if (walking) b.x += b.dir * b.v * dt;
      const g0 = this.ground(b.x, b.z), g1 = this.ground(b.x + b.dir * 0.25, b.z);
      b.y = g0;
      const pitch = Math.atan2(g1 - g0, 0.25) * 0.8;
      const yaw = b.dir > 0 ? 0 : Math.PI;
      _q.setFromAxisAngle(_ax.set(0, 1, 0), yaw).multiply(_qa.setFromAxisAngle(_ax.set(0, 0, 1), pitch));
      const sq = 1 - b.hunker * 0.18;
      _m.compose(_p.set(b.x, b.y - b.hunker * 0.02 + (walking ? Math.abs(Math.sin(b.ph * 9)) * 0.004 : 0), b.z), _q, _s.set(b.s * (1 - b.hunker * 0.06), b.s * sq, b.s));
      this.podB.setM(b.i, _m);
      _m2.makeRotationY(walking ? Math.sin(b.ph * 9) * 0.12 : 0).premultiply(_m);
      this.podL.setM(b.i, _m2);
    }
    this.podB.commit(); this.podL.commit();
  }

  private ground(x: number, z: number) { const S = this.scen.sand; return this.scen.heightAt(x, z) + (S.heightAt(x) - S.restAt(x)) * smooth(-2.6, -0.6, z); }

  dispose() {
    for (const h of [this.body, this.tail, this.podB, this.podL]) h.dispose();
    this.hazeMat?.dispose();
    this.group.removeFromParent();
  }
}
