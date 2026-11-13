// Lighting rig for the ocean scenes, tuned for a cinematic PS2 mood (Silent Hill 2 / MGS2 / Shadow of the
// Colossus): a strong key (the sun, refracted through the surface so underwater light comes in steeper than
// the sun in the sky, from above and behind the play plane, so it rims every silhouette) with real shadows
// that follow the camera, a low hemisphere ambient so shadows stay dark but readable, a soft cool fill from the
// camera side (light scattered back by the water column) so faces toward the viewer never go to mud, and a
// small pool of point lights for lamps and transient flashes (muzzle flashes, explosions, magic).
//
//   const rig = new Lighting();              scene.add(rig.group); rig.applyLook(LOOKS.reef)
//   const lamp = rig.lamp(x, y, z, '#ffb060', 3, 6);   lamp.set(x, y, z) / lamp.intensity = .. / lamp.release()
//   rig.flash(x, y, '#ffd890', 8, 0.08)                  // auto-decaying point light (also done by fx.muzzle...)
//
// Biome palettes tweak colours + water optics + the cinematic grade in one place (applyLook).
import * as THREE from 'three';
import { UW } from './shaders/underwater';
import { SKY } from './sky';
import { POST } from './post';
import { SURF } from './water/surface';

export interface Look {
  sky: [string, string]; seaFar: string; sun: string; cloudCover: number;
  scatterTop: string; scatterDeep: string; ext: [number, number, number]; clear: number; rays: number; rayCol: string;
  tir: string; shallow: string; deep: string;
  hemiSky: string; hemiGround: string; hemi: number; sunI: number;
  depthExt: [number, number, number]; depthMin: [number, number, number];
  caustic: number; causticCol: string;
  saturation: number; contrast: number; lift: [number, number, number]; gain: [number, number, number]; exposure: number;
  // ---- cinematic extras (optional; defaults applied when absent)
  /** split tone: shadow colour, highlight colour, amount */
  split?: [string, string, number];
  /** film grain, black crush, bloom, vignette */
  grain?: number; black?: number; bloom?: number; vignette?: number;
  /** soft camera-side fill (scattered light): colour, intensity */
  fill?: [string, number];
  /** key shadow darkness 0..1 */
  shadow?: number;
  /** distance fog for dry scenes: colour, density per metre */
  fog?: [string, number];
}

export const LOOKS: Record<string, Look> = {
  reef: {
    sky: ['#3f7fc4', '#c7e2ea'], seaFar: '#1a6386', sun: '#fff0d4', cloudCover: 0.5,
    scatterTop: '#17859e', scatterDeep: '#031428', ext: [0.13, 0.055, 0.04], clear: 6.5, rays: 0.95, rayCol: '#e6fff0',
    tir: '#2a8fb0', shallow: '#22b3c9', deep: '#0b5a80',
    hemiSky: '#7cc4dc', hemiGround: '#24343a', hemi: 0.75, sunI: 3.0,
    depthExt: [0.065, 0.028, 0.017], depthMin: [0.07, 0.11, 0.17], caustic: 0.8, causticCol: '#fff4d8',
    saturation: 1.0, contrast: 1.1, lift: [0, 0.006, 0.02], gain: [1.03, 1.0, 0.96], exposure: 0.95,
    split: ['#1a5866', '#ffbe7a', 0.28], fill: ['#8fbccc', 1.7], shadow: 0.9,
  },
  kelp: {
    sky: ['#4a86c0', '#d0e6de'], seaFar: '#1c5f62', sun: '#fff0cc', cloudCover: 0.62,
    scatterTop: '#2e9a8c', scatterDeep: '#031c20', ext: [0.15, 0.055, 0.055], clear: 5.5, rays: 1.35, rayCol: '#f2ffd2',
    tir: '#3a9f94', shallow: '#2aa898', deep: '#0d4f52',
    hemiSky: '#a6dcc0', hemiGround: '#2a3420', hemi: 0.8, sunI: 3.2,
    depthExt: [0.065, 0.026, 0.022], depthMin: [0.07, 0.12, 0.12], caustic: 1.1, causticCol: '#fffbd0',
    saturation: 0.98, contrast: 1.12, lift: [0.0, 0.016, 0.01], gain: [1.03, 1.02, 0.94], exposure: 1.0,
    split: ['#1e5a48', '#ffd08a', 0.3], fill: ['#a8ccb8', 1.6], shadow: 0.92,
  },
  graveyard: {
    sky: ['#56677a', '#b4b8b2'], seaFar: '#24403f', sun: '#e8e2d0', cloudCover: 0.85,
    scatterTop: '#3c6e68', scatterDeep: '#040e10', ext: [0.17, 0.08, 0.075], clear: 4.5, rays: 0.7, rayCol: '#e0eadc',
    tir: '#3a6a64', shallow: '#3a7a70', deep: '#123634',
    hemiSky: '#8ea8a0', hemiGround: '#20201a', hemi: 0.65, sunI: 2.3,
    depthExt: [0.075, 0.034, 0.03], depthMin: [0.06, 0.08, 0.08], caustic: 0.45, causticCol: '#e8f0dc',
    saturation: 0.82, contrast: 1.14, lift: [0.004, 0.012, 0.012], gain: [1.02, 1.0, 0.95], exposure: 0.98,
    split: ['#244a44', '#d8b080', 0.34], fill: ['#98b0aa', 1.4], shadow: 0.94, grain: 0.07, black: 0.04,
  },
  harbor: {
    sky: ['#6f9fd0', '#e6e0d0'], seaFar: '#3a6a70', sun: '#ffe6c0', cloudCover: 0.7,
    scatterTop: '#4e9890', scatterDeep: '#081c20', ext: [0.17, 0.075, 0.075], clear: 5, rays: 0.8, rayCol: '#fff4dc',
    tir: '#4a8f88', shallow: '#3f9890', deep: '#164a50',
    hemiSky: '#c0d8d0', hemiGround: '#3a3428', hemi: 0.85, sunI: 2.8,
    depthExt: [0.07, 0.03, 0.028], depthMin: [0.09, 0.11, 0.11], caustic: 0.8, causticCol: '#fff0d0',
    saturation: 0.96, contrast: 1.1, lift: [0.015, 0.012, 0.0], gain: [1.05, 1.0, 0.94], exposure: 1.0,
    split: ['#2a5a5a', '#ffc080', 0.3],
  },
  arctic: {
    sky: ['#7fa8d6', '#eef4f8'], seaFar: '#2a5a80', sun: '#f4fbff', cloudCover: 0.6,
    scatterTop: '#68bcd6', scatterDeep: '#051830', ext: [0.11, 0.045, 0.028], clear: 7.5, rays: 1.2, rayCol: '#f4fcff',
    tir: '#6ab8d8', shallow: '#4cb4d8', deep: '#164a7a',
    hemiSky: '#c4e4f4', hemiGround: '#3a4a58', hemi: 1.0, sunI: 3.0,
    depthExt: [0.055, 0.022, 0.013], depthMin: [0.1, 0.14, 0.22], caustic: 0.9, causticCol: '#f0fbff',
    saturation: 0.9, contrast: 1.08, lift: [0.01, 0.018, 0.035], gain: [0.98, 1.0, 1.04], exposure: 1.02,
    split: ['#2a4a70', '#ffe4c0', 0.24], fill: ['#c8dcec', 1.8], shadow: 0.85,
  },
  abyss: {
    sky: ['#1a2a5a', '#5a6a9a'], seaFar: '#0a1a3a', sun: '#c0d0ff', cloudCover: 0.8,
    scatterTop: '#0f2a40', scatterDeep: '#010309', ext: [0.21, 0.085, 0.06], clear: 4.5, rays: 0.4, rayCol: '#90c0e0',
    tir: '#16406a', shallow: '#164a7a', deep: '#04142a',
    hemiSky: '#3a5070', hemiGround: '#06080e', hemi: 0.6, sunI: 1.2,
    depthExt: [0.085, 0.042, 0.024], depthMin: [0.04, 0.055, 0.09], caustic: 0.3, causticCol: '#a0c8ff',
    saturation: 0.88, contrast: 1.14, lift: [0.0, 0.006, 0.018], gain: [0.96, 1.0, 1.05], exposure: 1.05,
    split: ['#162a3e', '#b8d4e8', 0.24], fill: ['#56708e', 1.3], shadow: 0.95, grain: 0.07, black: 0.035, bloom: 0.7,
  },
  sunset: {
    sky: ['#4a5aa8', '#ffb98a'], seaFar: '#3a4a7a', sun: '#ffcf96', cloudCover: 0.55,
    scatterTop: '#3e98a8', scatterDeep: '#08142e', ext: [0.12, 0.055, 0.045], clear: 6.5, rays: 1.4, rayCol: '#ffe0b8',
    tir: '#5a8aa8', shallow: '#3a8ab0', deep: '#14325a',
    hemiSky: '#e8b8a0', hemiGround: '#2a2030', hemi: 0.8, sunI: 3.0,
    depthExt: [0.05, 0.028, 0.02], depthMin: [0.1, 0.08, 0.15], caustic: 1.0, causticCol: '#ffe0b0',
    saturation: 1.04, contrast: 1.1, lift: [0.02, 0.0, 0.025], gain: [1.06, 0.99, 0.94], exposure: 1.0,
    split: ['#2a3a6a', '#ffb070', 0.36], fill: ['#d8aa92', 1.6],
  },
  /** dry interior (hideout cave): warm lamp pools against cold rock, distance fog, no water optics */
  hideout: {
    sky: ['#1a1e26', '#30343a'], seaFar: '#101418', sun: '#a8c0d8', cloudCover: 0.9,
    scatterTop: '#2a4a52', scatterDeep: '#05080a', ext: [0.2, 0.1, 0.08], clear: 5, rays: 0, rayCol: '#ffffff',
    tir: '#2a4a52', shallow: '#2a4a52', deep: '#0a1418',
    hemiSky: '#5a6a80', hemiGround: '#2a2018', hemi: 0.35, sunI: 0.6,
    depthExt: [0.06, 0.03, 0.02], depthMin: [0.1, 0.1, 0.1], caustic: 0, causticCol: '#ffffff',
    saturation: 0.92, contrast: 1.12, lift: [0.006, 0.008, 0.016], gain: [1.05, 1.0, 0.93], exposure: 1.05,
    split: ['#1c3a48', '#ffb060', 0.38], fill: ['#6a7a90', 0.6], shadow: 0.95, fog: ['#0b0d12', 0.035], grain: 0.065,
  },
};

/** a point light slot handed out by Lighting.lamp() */
export interface LampHandle {
  light: THREE.PointLight;
  set(x: number, y: number, z?: number): void;
  release(): void;
}

interface Slot { light: THREE.PointLight; kind: 'free' | 'lamp' | 'flash'; t0: number; dur: number; peak: number }

export class Lighting {
  sun = new THREE.DirectionalLight('#fff2d6', 2.6);
  hemi = new THREE.HemisphereLight('#9fe8ff', '#3a5a4a', 0.8);
  /** soft fill from the camera side, upper left (no shadows) */
  fill = new THREE.DirectionalLight('#9fc8d8', 1.5);
  group = new THREE.Group();
  private slots: Slot[] = [];

  constructor(shadowSize = 2048, points = 4) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = this.sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -22; c.right = 22; c.top = 16; c.bottom = -16; c.near = 1; c.far = 80;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 2;
    this.sun.shadow.intensity = 0.9;
    this.group.name = 'lighting';
    this.group.userData.rig = this;
    this.group.add(this.sun, this.sun.target, this.hemi, this.fill, this.fill.target);
    for (let i = 0; i < points; i++) {
      const l = new THREE.PointLight('#ffffff', 0, 8, 2);
      l.position.set(0, -1e4, 0);
      this.group.add(l);
      this.slots.push({ light: l, kind: 'free', t0: 0, dur: 0, peak: 0 });
    }
    this.setSun(SKY.uSunAir.value);
  }
  /** set the sky sun and derive the refracted underwater light direction (Snell, n = 1.333) */
  setSun(air: THREE.Vector3) {
    SKY.uSunAir.value.copy(air).normalize();
    const a = SKY.uSunAir.value;
    const horiz = Math.hypot(a.x, a.z);
    const sinT = horiz / 1.333;
    const cosT = Math.sqrt(1 - sinT * sinT);
    const k = horiz > 1e-5 ? sinT / horiz : 0;
    UW.uSunDir.value.set(a.x * k, cosT, a.z * k).normalize();
  }
  /** keep the shadow frustum on the action */
  follow(x: number, y: number) {
    const d = UW.uSunDir.value;
    this.sun.position.set(x + d.x * 40, y + d.y * 40, d.z * 40);
    this.sun.target.position.set(x, y, 0);
    this.sun.target.updateMatrixWorld();
    this.fill.position.set(x - 10, y + 9, 26);
    this.fill.target.position.set(x, y, 0);
    this.fill.target.updateMatrixWorld();
    this.tick();
  }
  /** a persistent point light (lantern, glowing crystal, sub headlamp). Returns null when the pool is full. */
  lamp(x: number, y: number, z: number, color: string, intensity = 3, distance = 7): LampHandle | null {
    const s = this.slots.find((q) => q.kind === 'free') ?? this.slots.find((q) => q.kind === 'flash');
    if (!s) return null;
    s.kind = 'lamp';
    s.light.color.set(color); s.light.intensity = intensity; s.light.distance = distance;
    s.light.position.set(x, y, z);
    return {
      light: s.light,
      set: (px, py, pz = s.light.position.z) => s.light.position.set(px, py, pz),
      release: () => { s.kind = 'free'; s.light.intensity = 0; s.light.position.set(0, -1e4, 0); },
    };
  }
  /** a transient flash that decays on its own (muzzle flash, explosion, spell) */
  flash(x: number, y: number, color: string, intensity = 8, dur = 0.12, distance = 7, z = 0.8) {
    let s = this.slots.find((q) => q.kind === 'free');
    if (!s) {
      // steal the oldest flash
      let best: Slot | null = null;
      for (const q of this.slots) if (q.kind === 'flash' && (!best || q.t0 < best.t0)) best = q;
      s = best ?? undefined;
    }
    if (!s) return;
    s.kind = 'flash'; s.t0 = performance.now(); s.dur = Math.max(0.02, dur); s.peak = intensity;
    s.light.color.set(color); s.light.distance = distance; s.light.intensity = intensity;
    s.light.position.set(x, y, z);
  }
  /** decay flashes (time based; safe to call several times per frame) */
  tick() {
    const now = performance.now();
    for (const s of this.slots) {
      if (s.kind !== 'flash') continue;
      const t = (now - s.t0) / 1000 / s.dur;
      if (t >= 1) { s.kind = 'free'; s.light.intensity = 0; s.light.position.set(0, -1e4, 0); continue; }
      s.light.intensity = s.peak * (1 - t) * (1 - t);
    }
  }
  update(_dt: number) { this.tick(); }

  applyLook(L: Look) {
    SKY.uSkyTop.value.set(L.sky[0]); SKY.uSkyHorizon.value.set(L.sky[1]); SKY.uSeaFar.value.set(L.seaFar); SKY.uSunCol.value.set(L.sun); SKY.uCloudCover.value = L.cloudCover;
    POST.uScatterTop.value.set(L.scatterTop); POST.uScatterDeep.value.set(L.scatterDeep); POST.uExt.value.set(...L.ext); POST.uClear.value = L.clear;
    POST.uRays.value = L.rays; POST.uRayCol.value.set(L.rayCol);
    POST.uSaturation.value = L.saturation; POST.uContrast.value = L.contrast; POST.uGradeLift.value.set(...L.lift); POST.uGain.value.set(...L.gain); POST.uExposure.value = L.exposure;
    SURF.uTir.value.set(L.tir); SURF.uShallow.value.set(L.shallow); SURF.uDeep.value.set(L.deep);
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemi;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
    UW.uDepthExt.value.set(...L.depthExt); UW.uDepthMin.value.set(...L.depthMin); UW.uCaustic.value = L.caustic; UW.uCausticCol.value.set(L.causticCol);
    // cinematic extras
    const sp = L.split ?? ['#1d5a66', '#ffb46a', 0.3];
    POST.uSplitLo.value.set(sp[0]); POST.uSplitHi.value.set(sp[1]); POST.uSplit.value = sp[2];
    POST.uGrain.value = L.grain ?? 0.055;
    POST.uBlack.value = L.black ?? 0.03;
    POST.uBloom.value = L.bloom ?? 0.5;
    POST.uVignette.value = L.vignette ?? 0.5;
    const fill = L.fill ?? ['#9fc8d8', 1.5];
    this.fill.color.set(fill[0]); this.fill.intensity = fill[1];
    this.sun.shadow.intensity = L.shadow ?? 0.9;
    const fog = L.fog ?? ['#0d0f14', 0];
    POST.uDryFogCol.value.set(fog[0]); POST.uDryFog.value = fog[1];
  }
}

/** find the Lighting rig living in an object's scene (Particles uses this to fire flashes) */
export function rigOf(o: THREE.Object3D): Lighting | null {
  let root: THREE.Object3D = o;
  while (root.parent) root = root.parent;
  for (const c of root.children) if (c.userData.rig instanceof Lighting) return c.userData.rig as Lighting;
  return null;
}
