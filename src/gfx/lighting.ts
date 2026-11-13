// Lighting rig for the ocean scenes, PS2-clean: ONE strong key from the surface (slightly toward the viewer, so the
// faces we look at are lit and crisp shadows fall back onto the scenery behind), a coloured ambient from the
// water (hemisphere: water colour above, sand bounce below), a crisp fresnel rim on everything near the play
// plane (src/gfx/shaders/underwater.ts) so characters pop off the background, and a small pool of point lights
// for lamps and transient flashes (muzzle flashes, explosions, magic).
//
//   const rig = new Lighting();              scene.add(rig.group); rig.applyLook(LOOKS.reef)
//   const lamp = rig.lamp(x, y, z, '#ffb060', 3, 6);   lamp.set(x, y, z) / lamp.light.intensity = .. / lamp.release()
//   rig.flash(x, y, '#ffd890', 8, 0.08)                  // auto-decaying point light (also done by fx.muzzle...)
//
// Per-area palettes (LOOKS) set the water colours the depth fog fades to, the key / ambient / rim colours, and
// the light grade. Area water: reef bright cyan -> blue, kelp green-teal, graveyard cold grey-blue, arctic pale
// ice blue, abyss near-black navy.
import * as THREE from 'three';
import { UW } from './shaders/underwater';
import { SKY } from './sky';
import { POST } from './post';
import { SURF } from './water/surface';

export interface Look {
  sky: [string, string]; seaFar: string; sun: string; cloudCover: number;
  /** water colour at the surface / in the deep: what distant layers fade to */
  scatterTop: string; scatterDeep: string; ext: [number, number, number]; clear: number; rays: number; rayCol: string;
  tir: string; shallow: string; deep: string;
  hemiSky: string; hemiGround: string; hemi: number; sunI: number;
  depthExt: [number, number, number]; depthMin: [number, number, number];
  caustic: number; causticCol: string;
  saturation: number; contrast: number; lift: [number, number, number]; gain: [number, number, number]; exposure: number;
  // ---- optional extras (defaults applied when absent)
  /** depth fog: metres of water before fog, density per metre, depth (m) where the water colour reaches scatterDeep */
  fogNear?: number; fogK?: number; fogDeep?: number;
  /** crisp rim light near the play plane: colour, strength */
  rim?: [string, number];
  /** soft camera-side fill (no shadows): colour, intensity */
  fill?: [string, number];
  /** subtle split tone: shadow colour, highlight colour, amount */
  split?: [string, string, number];
  bloom?: number; vignette?: number; black?: number; grain?: number;
  /** key shadow darkness 0..1 */
  shadow?: number;
  /** distance fog for dry scenes: colour, density per metre */
  fog?: [string, number];
}

const base = {
  ext: [0.11, 0.05, 0.035] as [number, number, number], clear: 5, cloudCover: 0.5,
  caustic: 0.8, causticCol: '#fff6dc', lift: [0, 0, 0.01] as [number, number, number], gain: [1, 1, 1] as [number, number, number],
};

export const LOOKS: Record<string, Look> = {
  reef: {
    ...base,
    sky: ['#3f86d8', '#c7ecf7'], seaFar: '#1d6f96', sun: '#fff4e0',
    scatterTop: '#3ec4dc', scatterDeep: '#1652a0', rays: 0.9, rayCol: '#f0fff8',
    tir: '#2a8fb0', shallow: '#22b3c9', deep: '#0b5a80',
    hemiSky: '#6fd2e8', hemiGround: '#4a5a48', hemi: 1.0, sunI: 3.4,
    depthExt: [0.022, 0.009, 0.005], depthMin: [0.4, 0.55, 0.65], caustic: 0.8,
    saturation: 1.1, contrast: 1.08, exposure: 1.0,
    fogNear: 5, fogK: 0.042, fogDeep: 34, rim: ['#e8fcff', 0.39], fill: ['#9fe0f0', 0.35], split: ['#1d4a66', '#ffc890', 0.08],
  },
  kelp: {
    ...base,
    sky: ['#4a8ccc', '#d6efe8'], seaFar: '#1f6a70', sun: '#fff2cc', cloudCover: 0.62,
    scatterTop: '#3aa68e', scatterDeep: '#0e4446', rays: 1.3, rayCol: '#f6ffd8',
    tir: '#3a9f94', shallow: '#2aa898', deep: '#0d4f52',
    hemiSky: '#7cc8a8', hemiGround: '#3a4428', hemi: 0.95, sunI: 3.2,
    depthExt: [0.026, 0.01, 0.009], depthMin: [0.35, 0.5, 0.45], caustic: 1.0, causticCol: '#fffbd0',
    saturation: 1.08, contrast: 1.1, exposure: 1.0,
    fogNear: 5, fogK: 0.048, fogDeep: 32, rim: ['#e0ffe8', 0.35], fill: ['#a8e0c4', 0.3], split: ['#1e4a3a', '#ffd890', 0.08],
  },
  graveyard: {
    ...base,
    sky: ['#56677a', '#b4b8b2'], seaFar: '#24403f', sun: '#e6ecf0', cloudCover: 0.85,
    scatterTop: '#7890a2', scatterDeep: '#243448', rays: 0.6, rayCol: '#e4eef4',
    tir: '#3a6a64', shallow: '#3a7a70', deep: '#123634',
    hemiSky: '#90a6b6', hemiGround: '#34322c', hemi: 0.9, sunI: 2.8,
    depthExt: [0.03, 0.014, 0.01], depthMin: [0.35, 0.42, 0.5], caustic: 0.4, causticCol: '#e8f0f4',
    saturation: 0.88, contrast: 1.1, exposure: 1.0,
    fogNear: 5, fogK: 0.05, fogDeep: 30, rim: ['#dce8f4', 0.39], fill: ['#a8b8c8', 0.3], split: ['#2a3a4c', '#e8d0b0', 0.08],
  },
  harbor: {
    ...base,
    sky: ['#6f9fd0', '#e6e0d0'], seaFar: '#3a6a70', sun: '#ffe6c0', cloudCover: 0.7,
    scatterTop: '#4e9c96', scatterDeep: '#143c44', rays: 0.8, rayCol: '#fff4dc',
    tir: '#4a8f88', shallow: '#3f9890', deep: '#164a50',
    hemiSky: '#a8d0c8', hemiGround: '#4a4436', hemi: 0.95, sunI: 3.0,
    depthExt: [0.03, 0.013, 0.012], depthMin: [0.35, 0.45, 0.45], caustic: 0.8, causticCol: '#fff0d0',
    saturation: 1.0, contrast: 1.08, exposure: 1.0,
    fogNear: 5, fogK: 0.05, fogDeep: 30, rim: ['#f0f8f0', 0.35],
  },
  arctic: {
    ...base,
    sky: ['#7fa8d6', '#eef4f8'], seaFar: '#2a5a80', sun: '#f6fbff', cloudCover: 0.6,
    scatterTop: '#b4e2f0', scatterDeep: '#3a78a6', rays: 1.1, rayCol: '#f4fcff',
    tir: '#6ab8d8', shallow: '#4cb4d8', deep: '#164a7a',
    hemiSky: '#c8ecf8', hemiGround: '#6a8090', hemi: 1.1, sunI: 3.2,
    depthExt: [0.02, 0.008, 0.004], depthMin: [0.45, 0.58, 0.7], caustic: 0.9, causticCol: '#f0fbff',
    saturation: 0.95, contrast: 1.06, exposure: 1.0,
    fogNear: 6, fogK: 0.034, fogDeep: 40, rim: ['#ffffff', 0.35], fill: ['#d8f0ff', 0.35], split: ['#3a5a78', '#fff0dc', 0.06],
  },
  abyss: {
    ...base,
    sky: ['#1a2a5a', '#5a6a9a'], seaFar: '#0a1a3a', sun: '#b8ccff', cloudCover: 0.8,
    scatterTop: '#0f2440', scatterDeep: '#02060e', rays: 0.25, rayCol: '#90c0e0',
    tir: '#16406a', shallow: '#164a7a', deep: '#04142a',
    hemiSky: '#2c4a70', hemiGround: '#080a10', hemi: 0.7, sunI: 1.6,
    depthExt: [0.03, 0.015, 0.008], depthMin: [0.25, 0.32, 0.45], caustic: 0.25, causticCol: '#a0c8ff',
    saturation: 1.0, contrast: 1.1, exposure: 1.05,
    fogNear: 4, fogK: 0.07, fogDeep: 26, rim: ['#7ab4ff', 0.52], fill: ['#4a6a9a', 0.3], split: ['#102038', '#c0d8f0', 0.06], bloom: 0.45,
  },
  sunset: {
    ...base,
    sky: ['#4a5aa8', '#ffb98a'], seaFar: '#3a4a7a', sun: '#ffcf96', cloudCover: 0.55,
    scatterTop: '#4aa0b0', scatterDeep: '#122a52', rays: 1.3, rayCol: '#ffe0b8',
    tir: '#5a8aa8', shallow: '#3a8ab0', deep: '#14325a',
    hemiSky: '#d8b0a0', hemiGround: '#3a2a3a', hemi: 0.9, sunI: 3.2,
    depthExt: [0.022, 0.012, 0.009], depthMin: [0.4, 0.35, 0.5], caustic: 1.0, causticCol: '#ffe0b0',
    saturation: 1.06, contrast: 1.08, exposure: 1.0,
    fogNear: 5, fogK: 0.045, fogDeep: 34, rim: ['#ffd8b8', 0.39], split: ['#2a3a6a', '#ffb070', 0.1],
  },
  /** dry interior (hideout cave): warm lamp pools against cool rock, distance fog, no water optics */
  hideout: {
    ...base,
    sky: ['#1a1e26', '#30343a'], seaFar: '#101418', sun: '#c8d8e8', cloudCover: 0.9,
    scatterTop: '#2a4a52', scatterDeep: '#05080a', rays: 0, rayCol: '#ffffff',
    tir: '#2a4a52', shallow: '#2a4a52', deep: '#0a1418',
    hemiSky: '#6a7a90', hemiGround: '#3a3024', hemi: 0.6, sunI: 1.0,
    depthExt: [0.0, 0.0, 0.0], depthMin: [1, 1, 1], caustic: 0, causticCol: '#ffffff',
    saturation: 1.02, contrast: 1.08, exposure: 1.0,
    rim: ['#b8c8e0', 0.24], fill: ['#8090a8', 0.25], split: ['#1c3a48', '#ffb060', 0.1], fog: ['#0e1016', 0.03],
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
  /** the key: from the surface, tilted toward the viewer; crisp shadows */
  sun = new THREE.DirectionalLight('#fff2d6', 3.2);
  /** coloured water ambient */
  hemi = new THREE.HemisphereLight('#6fd2e8', '#4a5a48', 1.0);
  /** weak camera-side fill (no shadows) */
  fill = new THREE.DirectionalLight('#9fe0f0', 0.35);
  group = new THREE.Group();
  private slots: Slot[] = [];

  constructor(shadowSize = 2048, points = 4) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = this.sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -22; c.right = 22; c.top = 16; c.bottom = -16; c.near = 1; c.far = 80;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 1;
    this.sun.shadow.intensity = 0.85;
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
    // key from the surface, leaning toward the viewer: faces toward the camera are lit, shadows fall behind
    const d = UW.uSunDir.value;
    const kd = new THREE.Vector3(d.x * 0.7, d.y, 0.55).normalize();
    this.sun.position.set(x + kd.x * 40, y + kd.y * 40, kd.z * 40);
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
    // depth fog + extras
    POST.uFogNear.value = L.fogNear ?? 5; POST.uFogK.value = L.fogK ?? 0.045; POST.uFogDeep.value = L.fogDeep ?? 34;
    const sp = L.split ?? ['#1d4a66', '#ffc890', 0.08];
    POST.uSplitLo.value.set(sp[0]); POST.uSplitHi.value.set(sp[1]); POST.uSplit.value = sp[2];
    POST.uBlack.value = L.black ?? 0;
    POST.uBloom.value = L.bloom ?? 0.3;
    POST.uVignette.value = L.vignette ?? 0.2;
    const rim = L.rim ?? ['#e8fcff', 0.35];
    UW.uRimGCol.value.set(rim[0]); UW.uRimG.value = rim[1];
    const fill = L.fill ?? ['#a0c8d8', 0.3];
    this.fill.color.set(fill[0]); this.fill.intensity = fill[1];
    this.sun.shadow.intensity = L.shadow ?? 0.85;
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
