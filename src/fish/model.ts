// FishModel: one live instance of a species. Shares the species geometry + textures; owns a cheap material
// clone so it can carry its own swim phase / flash / jaw / look / morph uniforms (the compiled program is
// shared by cache key). Special creatures (crab legs, turtle flippers, lures) add child parts + an animate hook.
import * as THREE from 'three';
import { FishInst, SpeciesUniforms, SwimFlags, swimMaterial, fishDepthMaterial } from './swim';
import type { UwOpts } from '../gfx/shaders/underwater';
import { damp, clamp } from '../core/math';

export interface SpeciesAsset {
  name: string;
  geo: THREE.BufferGeometry;
  map: THREE.Texture; normalMap: THREE.Texture | null; roughnessMap: THREE.Texture | null; emissiveMap: THREE.Texture | null;
  emissive: number;
  uni: SpeciesUniforms;
  flags: SwimFlags;
  uwo: UwOpts;
  depthMat: THREE.MeshDepthMaterial;
  length: number;
  mouth: THREE.Vector3; eye: THREE.Vector3; eyeR: number;
  anchors: Record<string, THREE.Vector3>;
  /** swim tuning */
  amp: number; freq: number; freqK: number; jawIdle: number;
  normalScale: number;
  /** extra per-instance parts (child meshes, lights) */
  parts?: (m: FishModel) => void;
  animate?: (m: FishModel, dt: number) => void;
  /** visual scale of the model group (assets authored at another size) */
  side?: THREE.Side;
  alphaTest?: number;
  transparent?: boolean;
  castShadow?: boolean;
  /** wet clearcoat layer (0 = none) */
  clearcoat?: number; clearcoatRough?: number;
}

export class FishModel {
  species: string;
  group = new THREE.Group();
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  inst = new FishInst();
  asset: SpeciesAsset;
  length: number;
  mouth: THREE.Vector3; eye: THREE.Vector3;
  phase: number;
  amp = 0;
  turnK = 0;
  jaw = 0; jawTarget = 0;
  morph = 0; morphTarget = 0;
  flashK = 0;
  lookYaw = 0; lookPitch = 0; lookYawT = 0; lookPitchT = 0;
  speed = 0;
  /** free-form animation state for special parts */
  anim: Record<string, number> = {};
  parts: Record<string, THREE.Object3D> = {};
  extraMats: THREE.Material[] = [];
  seed: number;
  constructor(asset: SpeciesAsset, seed = 0) {
    this.asset = asset; this.species = asset.name; this.seed = seed;
    this.length = asset.length;
    this.mouth = asset.mouth.clone(); this.eye = asset.eye.clone();
    this.phase = (seed * 2.399) % (Math.PI * 2);
    this.material = this.makeMaterial();
    this.mesh = new THREE.Mesh(asset.geo, this.material);
    this.mesh.castShadow = asset.castShadow ?? true;
    this.mesh.receiveShadow = false;
    this.mesh.customDepthMaterial = asset.depthMat;
    this.group.add(this.mesh);
    this.group.name = 'fish:' + asset.name;
    asset.parts?.(this);
  }
  /** a material for this instance (child parts may call it to share the instance uniforms) */
  makeMaterial(o: { map?: THREE.Texture; normalMap?: THREE.Texture | null; roughnessMap?: THREE.Texture | null; emissiveMap?: THREE.Texture | null; emissive?: number; flags?: SwimFlags } = {}): THREE.MeshStandardMaterial {
    const a = this.asset;
    const em = o.emissiveMap !== undefined ? o.emissiveMap : a.emissiveMap;
    const cc = a.clearcoat ?? 0.5;
    const P = cc > 0 ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new P({
      map: o.map ?? a.map, normalMap: o.normalMap !== undefined ? o.normalMap : a.normalMap, roughnessMap: o.roughnessMap !== undefined ? o.roughnessMap : a.roughnessMap,
      roughness: 1, metalness: 0, vertexColors: true, side: a.side ?? THREE.FrontSide,
      alphaToCoverage: !a.transparent, transparent: !!a.transparent, depthWrite: !a.transparent,
      emissive: em ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0), emissiveMap: em, emissiveIntensity: o.emissive ?? a.emissive,
    });
    if (a.alphaTest) m.alphaTest = a.alphaTest;
    if (m instanceof THREE.MeshPhysicalMaterial) { m.clearcoat = cc; m.clearcoatRoughness = a.clearcoatRough ?? 0.32; }
    if (m.normalMap) m.normalScale.set(a.normalScale, a.normalScale);
    swimMaterial(m, a.uni, this.inst, o.flags ?? a.flags, a.uwo);
    if (this.material) this.extraMats.push(m);
    return m;
  }

  /** advance the swim animation: swimSpeed in m/s, turn -1..1 (bends the body into a C) */
  update(dt: number, swimSpeed: number, turn = 0) {
    const a = this.asset;
    this.speed = swimSpeed;
    const bl = Math.abs(swimSpeed) / this.length;
    const f = a.freq + a.freqK * Math.min(bl, 6);
    this.phase += dt * f * Math.PI * 2;
    if (this.phase > 1e4) this.phase -= Math.PI * 2 * 1000;
    const ampT = a.amp * (0.3 + 0.7 * Math.min(1, bl / 2.2));
    this.amp = damp(this.amp, ampT, 4, dt);
    this.turnK = damp(this.turnK, clamp(turn, -1, 1), 7, dt);
    this.jaw = damp(this.jaw, Math.max(this.jawTarget, a.jawIdle * (0.6 + 0.4 * Math.sin(this.phase * 0.23))), 14, dt);
    this.morph = damp(this.morph, this.morphTarget, 9, dt);
    this.lookYaw = damp(this.lookYaw, this.lookYawT, 8, dt);
    this.lookPitch = damp(this.lookPitch, this.lookPitchT, 8, dt);
    this.flashK = Math.max(0, this.flashK - dt * 7);
    this.inst.uSwim.value.set(this.phase, this.amp, this.turnK, this.jaw);
    this.inst.uFx.value.set(this.flashK, this.morph, this.lookYaw, this.lookPitch);
    a.animate?.(this, dt);
  }
  /** white (or tinted) hit flash, decays on its own */
  flash(k = 1, col: THREE.ColorRepresentation = '#ffffff') { this.flashK = Math.max(this.flashK, k); this.inst.uFlashCol.value.set(col); }
  /** 0 closed .. 1 fully open (eased) */
  setJaw(k: number) { this.jawTarget = clamp(k, 0, 1.2); }
  setMorph(k: number) { this.morphTarget = clamp(k, 0, 1); }
  /** eyes look along a direction in model space (x forward, y up) */
  lookAt(dx: number, dy: number) {
    const l = Math.hypot(dx, dy) || 1;
    this.lookYawT = clamp((dx / l) * 0.45, -0.5, 0.5);
    this.lookPitchT = clamp((dy / l) * 0.4, -0.4, 0.4);
  }
  /** instant mirror: nose toward -x (models are authored nose +x) */
  setFlip(left: boolean) { this.group.rotation.y = left ? Math.PI : 0; }
  dispose() { this.material.dispose(); for (const m of this.extraMats) m.dispose(); }
}

export function makeAsset(o: Omit<SpeciesAsset, 'depthMat'> & { depthMat?: THREE.MeshDepthMaterial }): SpeciesAsset {
  return { ...o, depthMat: o.depthMat ?? fishDepthMaterial(o.map) };
}
