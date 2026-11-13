// WaterFX: owns the gameplay-plane surface sim (physics truth), the GPU ripple field and the surface meshes,
// and keeps the GPU-side copies (1D lift texture, swell uniforms) in sync.
//
//   water.disturb(x, strength, radius, z = 0)   impact at the surface: waves + ripples (+ = pushes down)
//   water.heightAt(x)                           live waterline y at world x on the gameplay plane
//   water.update(renderer, dt, cameraX)         call once per frame before rendering
import * as THREE from 'three';
import { WaterSim } from './sim';
import { Ripples } from './ripples';
import { makeSurface, SURF } from './surface';
import { UW } from '../shaders/underwater';

const LIFT_N = 1024;

export class WaterFX {
  sim = new WaterSim(90);
  ripples = new Ripples();
  group = new THREE.Group();
  liftData = new Float32Array(LIFT_N * 4);
  liftTex: THREE.DataTexture;
  private surf = makeSurface();

  constructor() {
    this.liftTex = new THREE.DataTexture(this.liftData, LIFT_N, 1, THREE.RGBAFormat, THREE.FloatType);
    this.liftTex.magFilter = THREE.LinearFilter; this.liftTex.minFilter = THREE.LinearFilter;
    this.liftTex.needsUpdate = true;
    SURF.uLift.value = this.liftTex;
    this.group.add(this.surf.sheet, this.surf.lip);
    this.group.name = 'water';
  }

  disturb(x: number, strength = 1, radius = 0.4, z = 0) {
    if (Math.abs(z) < 1.5) this.sim.disturb(x, strength, radius);
    this.ripples.impulse(x, z, strength, radius);
  }

  heightAt(x: number) { return this.sim.heightAt(x); }
  slopeAt(x: number) { return this.sim.slopeAt(x); }

  update(renderer: THREE.WebGLRenderer, dt: number, cx: number) {
    this.sim.update(dt, cx, UW.uTime.value);
    this.ripples.update(renderer, dt, cx);
    this.sim.fill(this.liftData, LIFT_N);
    this.liftTex.needsUpdate = true;
    SURF.uLiftBox.value.set(this.sim.x0, this.sim.width);
    SURF.uRip.value = this.ripples.texture;
    SURF.uRipBox.value.set(this.ripples.x0, this.ripples.z0, this.ripples.W, this.ripples.D);
    for (let i = 0; i < 3; i++) { const w = this.sim.swell[i]; SURF.uSwell.value[i].set(w.A, w.L, w.c, w.Q); }
    this.surf.update(cx);
  }
}
