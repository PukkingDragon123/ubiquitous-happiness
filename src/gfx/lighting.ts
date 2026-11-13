// Lighting rig for the ocean scenes: the sun (refracted through the surface, so underwater light comes in
// steeper than the sun in the sky), a soft shadow map that follows the camera, sky/seabed hemisphere fill and
// a warm bounce. Biome palettes tweak colours + water optics in one place (applyLook).
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
}

export const LOOKS: Record<string, Look> = {
  reef: {
    sky: ['#3f86d8', '#c7ecf7'], seaFar: '#1d6f96', sun: '#fff2d6', cloudCover: 0.5,
    scatterTop: '#1a92ad', scatterDeep: '#041a33', ext: [0.12, 0.05, 0.038], clear: 7, rays: 0.8, rayCol: '#e6fff4',
    tir: '#2a8fb0', shallow: '#22b3c9', deep: '#0b5a80',
    hemiSky: '#8fd8f0', hemiGround: '#2a4048', hemi: 0.75, sunI: 1.8,
    depthExt: [0.06, 0.026, 0.016], depthMin: [0.08, 0.13, 0.2], caustic: 0.7, causticCol: '#fff6dc',
    saturation: 1.18, contrast: 1.1, lift: [0, 0.008, 0.025], gain: [1.03, 1.0, 0.97], exposure: 0.95,
  },
  kelp: {
    sky: ['#4a8ccc', '#d6efe8'], seaFar: '#1f6a70', sun: '#fff0cc', cloudCover: 0.62,
    scatterTop: '#3fb7a6', scatterDeep: '#05282e', ext: [0.14, 0.05, 0.05], clear: 6, rays: 1.2, rayCol: '#f6ffd8',
    tir: '#3a9f94', shallow: '#2aa898', deep: '#0d4f52',
    hemiSky: '#bff0d8', hemiGround: '#3a4a2a', hemi: 1.0, sunI: 2.4,
    depthExt: [0.06, 0.024, 0.02], depthMin: [0.09, 0.15, 0.15], caustic: 1.1, causticCol: '#fffbd0',
    saturation: 1.1, contrast: 1.08, lift: [0.0, 0.02, 0.015], gain: [1.03, 1.02, 0.95], exposure: 1.0,
  },
  harbor: {
    sky: ['#6f9fd0', '#e6e0d0'], seaFar: '#3a6a70', sun: '#ffe6c0', cloudCover: 0.7,
    scatterTop: '#5aa8a0', scatterDeep: '#0a2228', ext: [0.16, 0.07, 0.07], clear: 5, rays: 0.8, rayCol: '#fff4dc',
    tir: '#4a8f88', shallow: '#3f9890', deep: '#164a50',
    hemiSky: '#d0e8e0', hemiGround: '#4a4436', hemi: 1.0, sunI: 2.2,
    depthExt: [0.07, 0.03, 0.028], depthMin: [0.1, 0.13, 0.13], caustic: 0.8, causticCol: '#fff0d0',
    saturation: 1.02, contrast: 1.08, lift: [0.02, 0.015, 0.0], gain: [1.05, 1.0, 0.94], exposure: 1.0,
  },
  arctic: {
    sky: ['#7fb2e6', '#f0f8ff'], seaFar: '#2a5f8a', sun: '#f4fbff', cloudCover: 0.55,
    scatterTop: '#7ad0e8', scatterDeep: '#071f3a', ext: [0.1, 0.04, 0.025], clear: 8, rays: 1.1, rayCol: '#f4fcff',
    tir: '#6ab8d8', shallow: '#4cb4d8', deep: '#164a7a',
    hemiSky: '#d8f4ff', hemiGround: '#4a6070', hemi: 1.25, sunI: 2.4,
    depthExt: [0.05, 0.02, 0.012], depthMin: [0.12, 0.17, 0.26], caustic: 0.9, causticCol: '#f0fbff',
    saturation: 1.0, contrast: 1.05, lift: [0.01, 0.02, 0.04], gain: [0.98, 1.0, 1.04], exposure: 1.02,
  },
  abyss: {
    sky: ['#1a2a5a', '#5a6a9a'], seaFar: '#0a1a3a', sun: '#c0d0ff', cloudCover: 0.8,
    scatterTop: '#1a4a7a', scatterDeep: '#010612', ext: [0.2, 0.08, 0.05], clear: 5, rays: 0.4, rayCol: '#a0d8ff',
    tir: '#16406a', shallow: '#164a7a', deep: '#04142a',
    hemiSky: '#4a6aaa', hemiGround: '#0a1020', hemi: 0.7, sunI: 1.0,
    depthExt: [0.08, 0.04, 0.02], depthMin: [0.04, 0.06, 0.12], caustic: 0.4, causticCol: '#a0c8ff',
    saturation: 1.15, contrast: 1.12, lift: [0.0, 0.01, 0.04], gain: [0.95, 1.0, 1.08], exposure: 1.05,
  },
  sunset: {
    sky: ['#4a5aa8', '#ffb98a'], seaFar: '#3a4a7a', sun: '#ffcf96', cloudCover: 0.55,
    scatterTop: '#4aa8b8', scatterDeep: '#0a1a3a', ext: [0.11, 0.05, 0.04], clear: 7, rays: 1.3, rayCol: '#ffe0b8',
    tir: '#5a8aa8', shallow: '#3a8ab0', deep: '#14325a',
    hemiSky: '#ffd0b0', hemiGround: '#3a2a3a', hemi: 1.0, sunI: 2.3,
    depthExt: [0.045, 0.026, 0.018], depthMin: [0.12, 0.1, 0.18], caustic: 1.0, causticCol: '#ffe0b0',
    saturation: 1.12, contrast: 1.08, lift: [0.03, 0.0, 0.03], gain: [1.06, 0.99, 0.95], exposure: 1.0,
  },
};

export class Lighting {
  sun = new THREE.DirectionalLight('#fff2d6', 2.6);
  hemi = new THREE.HemisphereLight('#9fe8ff', '#3a5a4a', 1.1);
  group = new THREE.Group();
  constructor(shadowSize = 2048) {
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const c = this.sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -22; c.right = 22; c.top = 16; c.bottom = -16; c.near = 1; c.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    this.sun.shadow.radius = 4;
    this.sun.shadow.intensity = 0.75;
    this.group.add(this.sun, this.sun.target, this.hemi);
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
  }
  applyLook(L: Look) {
    SKY.uSkyTop.value.set(L.sky[0]); SKY.uSkyHorizon.value.set(L.sky[1]); SKY.uSeaFar.value.set(L.seaFar); SKY.uSunCol.value.set(L.sun); SKY.uCloudCover.value = L.cloudCover;
    POST.uScatterTop.value.set(L.scatterTop); POST.uScatterDeep.value.set(L.scatterDeep); POST.uExt.value.set(...L.ext); POST.uClear.value = L.clear;
    POST.uRays.value = L.rays; POST.uRayCol.value.set(L.rayCol);
    POST.uSaturation.value = L.saturation; POST.uContrast.value = L.contrast; POST.uGradeLift.value.set(...L.lift); POST.uGain.value.set(...L.gain); POST.uExposure.value = L.exposure;
    SURF.uTir.value.set(L.tir); SURF.uShallow.value.set(L.shallow); SURF.uDeep.value.set(L.deep);
    this.hemi.color.set(L.hemiSky); this.hemi.groundColor.set(L.hemiGround); this.hemi.intensity = L.hemi;
    this.sun.color.set(L.sun); this.sun.intensity = L.sunI;
    UW.uDepthExt.value.set(...L.depthExt); UW.uDepthMin.value.set(...L.depthMin); UW.uCaustic.value = L.caustic; UW.uCausticCol.value.set(L.causticCol);
  }
}
