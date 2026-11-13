// Assembles one fisherman's model: look -> rig dims -> skinned lofted body + painted page -> material with a
// face-flush term -> face rig, hat and gear meshes on their bones. Built parts are cached per archetype + seed
// (geometry, page texture) so a crowd of the same fisherman costs one build.
import * as THREE from 'three';
import type { Archetype, Look } from './looks';
import { makeLook } from './looks';
import type { Dims, BoneName } from './rig';
import { rigDims, makeSkeleton, BI } from './rig';
import { buildBody } from './body';
import type { BodyBuild } from './body';
import { paintPage } from './paint';
import { paintMouths, FaceRig } from './face';
import { buildGear } from './gear';
import type { Gear } from './gear';

export interface ModelParts {
  look: Look; dims: Dims; body: BodyBuild; tex: THREE.Texture;
}
const cache = new Map<string, ModelParts>();
const PROF = typeof location !== 'undefined' && location.search.includes('prof');

export function modelParts(arch: Archetype, seed: number): ModelParts {
  const key = arch + ':' + seed;
  const hit = cache.get(key);
  if (hit) return hit;
  const t0 = performance.now();
  const look = makeLook(arch, seed);
  const dims = rigDims(look.build);
  const body = buildBody(look, dims);
  const t1 = performance.now();
  const page = paintPage(look, body.shape);
  paintMouths(page, look);
  if (PROF) console.info(`[humans] ${arch}: geometry ${Math.round(t1 - t0)} ms, paint ${Math.round(performance.now() - t1)} ms`);
  const parts: ModelParts = { look, dims, body, tex: page.texture() };
  // gear painters add to the page before upload
  parts.tex.dispose();
  const P = page;
  buildGear.paint(P, look, body.shape);
  parts.tex = P.texture();
  cache.set(key, parts);
  return parts;
}

/** a soft self-lit fill so faces and clothes stay readable against the bright sky / under hat brims
 * (x: whole body, y: extra on the face) — the game is read from the side at a distance */
export const FILL = { value: new THREE.Vector2(0.16, 0.32) };

/** per-instance material: page texture + a face flush (angry red / strain) driven by uFlush */
export function bodyMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial & { userData: { flush: { value: THREE.Vector3 } } } {
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0, alphaTest: 0.5, vertexColors: true });
  const flush = { value: new THREE.Vector3(0, 0, 0) };
  m.userData.flush = flush;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFlush = flush;
    sh.uniforms.uFill = FILL;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFlush; varying float vFlush;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlush = aFlush;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uFlush; uniform vec2 uFill; varying float vFlush;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uFlush * vFlush * diffuseColor.rgb + diffuseColor.rgb * (uFill.x + uFill.y * vFlush);\ndiffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.0, 0.78, 0.74), clamp(length(uFlush) * 2.0, 0.0, 1.0) * vFlush);');
  };
  m.customProgramCacheKey = () => 'fisherBody';
  return m as THREE.MeshStandardMaterial & { userData: { flush: { value: THREE.Vector3 } } };
}

export interface Model {
  parts: ModelParts;
  root: THREE.Group;            // body space (feet on y = 0, facing +z)
  mesh: THREE.SkinnedMesh;
  bones: Record<BoneName, THREE.Bone>;
  face: FaceRig;
  mat: ReturnType<typeof bodyMaterial>;
  gear: Gear;
}

export function buildModel(arch: Archetype, seed: number): Model {
  const parts = modelParts(arch, seed);
  const { look, dims, body } = parts;
  const mat = bodyMaterial(parts.tex);
  const { bones, byName, skeleton } = makeSkeleton(dims);
  const mesh = new THREE.SkinnedMesh(body.geometry, mat);
  mesh.add(bones[BI.hips]);
  mesh.bind(skeleton);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  const root = new THREE.Group();
  root.add(mesh);
  const face = new FaceRig(body.head, mat, (k) => mat.userData.flush.value.set(0.55 * k, 0.04 * k, 0.02 * k));
  // the face rig lives in head-bone space
  const head = byName.head;
  head.add(face.group);
  const gear = buildGear(look, body, dims, mat, byName);
  return { parts, root, mesh, bones: byName, face, mat, gear };
}
