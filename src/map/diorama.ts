// The act map as a tabletop miniature: a thick slab of ocean on a wooden table. A cutting plane follows the
// camera, so the bottom of the screen always shows the slab's cross-section (stepped water bands, the
// seabed strata with ore voxels, islands sliced like cake), while the top shows the animated water with
// islands, boats, buoys and currents. Built once per act map.
import * as THREE from 'three';
import { Loft } from '../gfx/loft';
import { Rng } from '../core/rng';
import { clamp, lerp, smooth } from '../core/math';
import { Px } from '../gfx/px';
import type { ActMap } from './gen';
import { Layout, SLAB, Island } from './layout';
import { PAL, ZonePal, blendCol, blendNum } from './palette';
import { atlas, foliage, groundDetail, medallions, rockTex, tableTex, A, F } from './tex';
import { DIO, dio, waterMaterial, waterUniforms, groundMaterial, groundUniforms, capMaterial, capUniforms, wallMaterial, ribbonMaterial, beamMaterial, CapUniforms } from './shaders';
import { blob, lathe, lighthouse, palmGeometry, place, rockGeometry, kelpGeometry, rod, stiltHut, box, gid } from './build';
import { SpotCtx, buildSpot, lineSegs, beamCone } from './spots';
import { Life } from './life';
import { Marker } from './markers';

const DEBUG_TIMING = new URLSearchParams(location.search).has('timing');
let TEX: { atlas: ReturnType<typeof atlas>; foliage: THREE.Texture; detail: THREE.DataTexture; rock: THREE.Texture; table: THREE.Texture; med: ReturnType<typeof medallions>; halo: THREE.Texture } | null = null;
function textures() {
  if (TEX) return TEX;
  const hp = new Px(32, 32);
  hp.fill((x, y) => { const d = Math.hypot(x - 15.5, y - 15.5) / 16; const a = Math.max(0, 1 - d); return [255, 255, 255, Math.round(a * a * 255)]; });
  const halo = new THREE.DataTexture(hp.d, 32, 32); halo.needsUpdate = true; halo.magFilter = THREE.LinearFilter; halo.minFilter = THREE.LinearFilter;
  TEX = { atlas: atlas(), foliage: foliage(), detail: groundDetail(), rock: rockTex(), table: tableTex(), med: medallions(), halo };
  return TEX;
}

export interface RibbonInfo { key: string; a: number; b: number; index: number; v0: number; v1: number }

export class Diorama {
  group = new THREE.Group();
  map: ActMap;
  lay: Layout;
  pals: ZonePal[];
  cut = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1000);
  sun = new THREE.DirectionalLight('#fff0d4', 2.6);
  hemi = new THREE.HemisphereLight('#bfe8ff', '#5a4a3a', 1.0);
  markers: Marker[] = [];
  ctx: SpotCtx;
  life: Life;
  ribbons = new Map<string, RibbonInfo>();
  private ribState: Float32Array;
  private ribGeo: THREE.BufferGeometry;
  private capU: CapUniforms;
  private prof: Float32Array;
  private profTex: THREE.DataTexture;
  private profN = 512;
  private cap: THREE.Mesh;
  atlasMat: THREE.MeshStandardMaterial;
  private haloMat: THREE.SpriteMaterial;
  private beamMats: THREE.ShaderMaterial[] = [];
  private lhBeams: THREE.Object3D[] = [];
  private mats: THREE.Material[] = [];
  private disposables: { dispose(): void }[] = [];
  night = 0;
  cutZ = 1000;

  constructor(map: ActMap) {
    this.map = map;
    const t0 = performance.now();
    const T = textures();
    const t1 = performance.now();
    const lay = (this.lay = new Layout(map));
    const t2 = performance.now();
    this.pals = lay.zoneIds.map((z) => PAL[z]);
    const pal0 = this.pals[0];
    this.night = Math.max(...this.pals.map((p) => p.night));
    const zz = map.zoneZ;
    DIO.uZoneZ.value.set(zz[0] ?? -1e5, zz[1] ?? -1e5, 2.2);
    // ---------------------------------------------------------------- materials
    this.atlasMat = this.reg(dio(new THREE.MeshStandardMaterial({ map: T.atlas.map, emissiveMap: T.atlas.emissive, emissive: '#ffffff', emissiveIntensity: 0.5 + this.night * 1.6, roughness: 0.78 })));
    this.haloMat = new THREE.SpriteMaterial({ map: T.halo, color: '#ffc870', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.25 + this.night * 0.75 });
    const halo = (s: number) => { const sp = new THREE.Sprite(this.haloMat); sp.scale.setScalar(s * (1 + this.night)); sp.renderOrder = 7; return sp; };
    const beamMat = (k: number) => { const m = beamMaterial(new THREE.Color('#fff2c8'), (0.12 + this.night * 0.6) * k); this.beamMats.push(m); return m; };
    // ---------------------------------------------------------------- the slab: ground, water, walls, cutaway, table
    const field = this.bakeField();
    const GU = groundUniforms();
    GU.uField.value = field; GU.uDetail.value = T.detail;
    GU.uFieldBox.value.set(lay.x0, lay.z0, 1 / (lay.W), 1 / (lay.zFront - lay.zBack));
    for (let i = 0; i < 3; i++) {
      const p = this.pals[Math.min(i, this.pals.length - 1)];
      for (let k = 0; k < 4; k++) {
        GU.uSand.value[i * 4 + k].set(p.sand[k]); GU.uGrass.value[i * 4 + k].set(p.grass[k]);
        GU.uRock.value[i * 4 + k].set(p.rock[k]); GU.uBed.value[i * 4 + k].set(p.bed[k]);
      }
    }
    const ground = new THREE.Mesh(this.groundGeo(), this.reg(groundMaterial(GU)));
    ground.receiveShadow = true; ground.castShadow = true;
    this.group.add(ground);
    const WU = waterUniforms();
    WU.uField.value = field; WU.uFieldBox.value.copy(GU.uFieldBox.value);
    for (let i = 0; i < 3; i++) {
      const p = this.pals[Math.min(i, this.pals.length - 1)];
      WU.uShallow.value[i].set(p.shallow); WU.uDeep.value[i].set(p.deep); WU.uFoam.value[i].set(p.foam); WU.uSky.value[i].set(p.sky); WU.uPlank.value[i].set(p.plankton);
    }
    const water = new THREE.Mesh(this.waterGeo(), this.reg(waterMaterial(WU)));
    water.receiveShadow = true; water.renderOrder = 1;
    this.group.add(water);
    const walls = new THREE.Mesh(this.wallGeo(), wallMaterial(new THREE.Color(pal0.deep), new THREE.Color(pal0.strata[2]), -2.2));
    walls.castShadow = true;
    this.group.add(walls);
    this.capU = capUniforms();
    this.prof = new Float32Array(this.profN * 4);
    this.profTex = new THREE.DataTexture(this.prof, this.profN, 1, THREE.RGBAFormat, THREE.FloatType);
    this.profTex.magFilter = THREE.NearestFilter; this.profTex.minFilter = THREE.NearestFilter;
    this.capU.uProf.value = this.profTex;
    this.capU.uProfX.value.set(-lay.W / 2, 1 / lay.W);
    this.capU.uBottom.value = -lay.depth; this.capU.uHalfW.value = lay.W / 2; this.capU.uBevel.value = SLAB.bevel;
    const capH = lay.depth + 2.6;
    this.cap = new THREE.Mesh(new THREE.PlaneGeometry(lay.W, capH).translate(0, -lay.depth + capH / 2, 0), capMaterial(this.capU));
    this.cap.renderOrder = 5;
    this.cap.frustumCulled = false;
    this.group.add(this.cap);
    const tt = T.table.clone(); tt.needsUpdate = true; tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(16, 22);
    const tableMat = new THREE.MeshStandardMaterial({ map: tt, color: pal0.table, roughness: 0.62, metalness: 0.0 });
    tableMat.color.multiplyScalar(1.7);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(190, 260).rotateX(-Math.PI / 2), tableMat);
    table.position.set(0, -lay.depth - 0.003, (lay.zFront + lay.zBack) / 2);
    table.receiveShadow = true;
    this.group.add(table);
    this.mats.push(tableMat);
    // ---------------------------------------------------------------- vignettes (the fishing spots) + island dressing
    this.ctx = new SpotCtx(lay, this.atlasMat, beamMat, halo);
    for (const v of lay.vignettes) buildSpot(v, this.ctx);
    this.dressIslands(halo, beamMat);
    const statics = new THREE.Mesh(this.ctx.L.build(), this.atlasMat);
    statics.castShadow = true; statics.receiveShadow = true;
    this.group.add(statics, this.ctx.group);
    if (this.ctx.lines.length) { const ls = lineSegs(this.ctx.lines); this.group.add(ls); }
    for (const h of this.ctx.halos) { const s = halo(0.24); s.position.set(h[0], h[1], h[2]); this.group.add(s); }
    const t3 = performance.now();
    this.instanced();
    const t4 = performance.now();
    // ---------------------------------------------------------------- life, currents, markers
    this.life = new Life(lay, this.atlasMat, this.ctx.schools, halo);
    this.group.add(this.life.group);
    const ribMat = ribbonMaterial();
    const rg = this.ribbonGeo();
    this.ribGeo = rg.geo; this.ribState = rg.state;
    const rib = new THREE.Mesh(rg.geo, ribMat);
    rib.renderOrder = 2; rib.frustumCulled = false;
    this.group.add(rib);
    for (const n of map.nodes) {
      const mk = new Marker(n, this.atlasMat, T.med.tex, T.med.uv(n.type));
      this.markers.push(mk);
      this.group.add(mk.root);
    }
    const t5 = performance.now();
    if (DEBUG_TIMING) console.log('[map] diorama build ms: tex', (t1 - t0).toFixed(0), 'layout', (t2 - t1).toFixed(0), 'slab+spots', (t3 - t2).toFixed(0), 'instanced', (t4 - t3).toFixed(0), 'life+markers', (t5 - t4).toFixed(0));
    // ---------------------------------------------------------------- light
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -21; sc.right = 21; sc.top = 17; sc.bottom = -17; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.02; this.sun.shadow.radius = 3;
    this.sun.shadow.intensity = 0.78;
    this.group.add(this.sun, this.sun.target, this.hemi);
    // every lit material is clipped by the cutaway plane
    this.group.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m || o === table) return;
      for (const mm of Array.isArray(m) ? m : [m]) {
        if ((mm as THREE.ShaderMaterial).isShaderMaterial || (mm as THREE.SpriteMaterial).isSpriteMaterial || (mm as THREE.LineBasicMaterial).isLineBasicMaterial) continue;
        if (mm === tableMat) continue;
        mm.clippingPlanes = [this.cut];
        mm.clipShadows = true;
      }
    });
    (this.haloMat as THREE.Material).clippingPlanes = [this.cut];
    this.group.traverse((o) => { const l = o as THREE.LineSegments; if (l.isLineSegments) (l.material as THREE.Material).clippingPlanes = [this.cut]; });
  }

  private reg<T extends THREE.Material>(m: T): T { this.mats.push(m); return m; }

  // ------------------------------------------------------------------ baked field texture (depth / foam distance / rockiness / vegetation)
  private bakeField(): THREE.DataTexture {
    const lay = this.lay;
    const N = lay.nx * lay.nz;
    const d = new Uint8Array(N * 4);
    for (let k = 0; k < N; k++) {
      const g = lay.g[k];
      d[k * 4] = clamp(-g / 4.5, 0, 1) * 255;
      d[k * 4 + 1] = clamp(lay.shore[k] / 2.5, 0, 1) * 255;
      d[k * 4 + 2] = lay.rocky[k] * 255;
      d[k * 4 + 3] = lay.veg[k] * 255;
    }
    const t = new THREE.DataTexture(d, lay.nx, lay.nz, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    this.disposables.push(t);
    return t;
  }

  private groundGeo(): THREE.BufferGeometry {
    const lay = this.lay, nx = lay.nx, nz = lay.nz, st = lay.step;
    const pos = new Float32Array(nx * nz * 3), nrm = new Float32Array(nx * nz * 3), ao = new Float32Array(nx * nz);
    const G = (i: number, j: number) => lay.g[clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let x = lay.x0 + i * st, z = lay.z0 + j * st;
      [x, z] = lay.clampIn(x, z);
      const g = G(i, j);
      pos[k * 3] = x; pos[k * 3 + 1] = g; pos[k * 3 + 2] = z;
      const dx = (G(i + 1, j) - G(i - 1, j)) / (2 * st), dz = (G(i, j + 1) - G(i, j - 1)) / (2 * st);
      const l = Math.hypot(dx, 1, dz);
      nrm[k * 3] = -dx / l; nrm[k * 3 + 1] = 1 / l; nrm[k * 3 + 2] = -dz / l;
      // cheap ambient occlusion: how far below its neighbourhood the point sits
      let avg = 0, c = 0;
      for (const [a, b] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, 3], [-3, 3], [3, -3]]) { avg += G(i + a, j + b); c++; }
      avg /= c;
      let o = 1 - Math.max(0, avg - g) * 1.6;
      if (g < 0) o *= 1 - 0.3 * smooth(0.45, 0.0, lay.shore[k]) * smooth(-0.05, -0.6, g);
      ao[k] = clamp(o, 0.35, 1);
    }
    const idx: number[] = [];
    for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aAO', new THREE.BufferAttribute(ao, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  private waterGeo(): THREE.BufferGeometry {
    const lay = this.lay, hw = lay.W / 2, Rb = SLAB.bevel;
    const axis = (a: number, b: number, edgeA: boolean, edgeB: boolean) => {
      const out: number[] = [];
      const fine = Rb * 1.4;
      let v = a;
      while (v < b - 1e-6) {
        out.push(v);
        const near = (edgeA && v - a < fine) || (edgeB && b - v < fine);
        v += near ? 0.05 : 0.25;
      }
      out.push(b);
      return out;
    };
    const xs = axis(-hw, hw, true, true), zs = axis(lay.zBack, lay.zFront, true, false);
    const nx = xs.length, nz = zs.length;
    const pos = new Float32Array(nx * nz * 3), edge = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      let x = xs[i], z = zs[j];
      [x, z] = lay.clampIn(x, z);
      const sd = Math.max(0, lay.sd(x, z));
      const e = Math.min(sd, Rb);
      const y = -(Rb - Math.sqrt(Math.max(0, Rb * Rb - (Rb - e) * (Rb - e))));
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      edge[k] = smooth(0, Rb, sd);
    }
    const idx: number[] = [];
    for (let j = 0; j + 1 < nz; j++) for (let i = 0; i + 1 < nx; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private wallGeo(): THREE.BufferGeometry {
    const lay = this.lay, hw = lay.W / 2, R = SLAB.cornerR;
    const path: [number, number][] = [[hw, lay.zFront]];
    path.push([hw, lay.zBack + R]);
    for (let k = 1; k <= 10; k++) { const a = (k / 10) * (Math.PI / 2); path.push([hw - R + Math.cos(a) * R, lay.zBack + R - Math.sin(a) * R]); }
    for (let k = 0; k <= 10; k++) { const a = Math.PI / 2 + (k / 10) * (Math.PI / 2); path.push([-hw + R + Math.cos(a) * R, lay.zBack + R - Math.sin(a) * R]); }
    path.push([-hw, lay.zFront]);
    const pos: number[] = [], idx: number[] = [];
    path.forEach(([x, z]) => { pos.push(x, -SLAB.bevel, z, x, -lay.depth, z); });
    for (let i = 0; i + 1 < path.length; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ------------------------------------------------------------------ islands: palms, bushes, huts, the lighthouse, houses, pines
  private dressIslands(halo: (s: number) => THREE.Object3D, beamMat: (k: number) => THREE.Material) {
    const lay = this.lay, L = this.ctx.L, rng = new Rng(this.map.seed ^ 0x15a1);
    const landPts = (isl: Island, n: number, minG: number, maxSlope = 0.6): [number, number, number][] => {
      const out: [number, number, number][] = [];
      for (let k = 0; k < n * 8 && out.length < n; k++) {
        const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * isl.r * 1.05;
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
        const g = lay.sampleG(x, z);
        if (g < minG) continue;
        const sl = Math.hypot(lay.sampleG(x + 0.1, z) - lay.sampleG(x - 0.1, z), lay.sampleG(x, z + 0.1) - lay.sampleG(x, z - 0.1)) / 0.2;
        if (sl > maxSlope) continue;
        if (lay.clearance(x, z, 0.45, 0.3) < 0) continue;
        out.push([x, g, z]);
      }
      return out;
    };
    // the lighthouse sits on the biggest side island near the middle of the act
    const mid = (lay.zFront + lay.zBack) / 2;
    const cands = lay.islands.filter((i) => i.r > 1.1 && !i.tag && Math.abs(i.x) > lay.W / 2 - 4.5).sort((a, b) => Math.abs(a.z - mid) - Math.abs(b.z - mid));
    const lhIsl = cands[0];
    if (lhIsl) {
      const pts = landPts(lhIsl, 1, 0.15, 1.2);
      const [x, g, z] = pts[0] ?? [lhIsl.x, Math.max(0.1, lay.sampleG(lhIsl.x, lhIsl.z)), lhIsl.z];
      const from = L.count;
      const lampY = lighthouse(L);
      place(L, from, [x, g - 0.02, z], rng.range(0, 6));
      const piv = new THREE.Group(); piv.position.set(x, g + lampY, z);
      piv.add(beamCone(beamMat(1.3), 7, 0.9));
      const b2 = beamCone(beamMat(1.3), 7, 0.9); b2.rotation.y = Math.PI; piv.add(b2);
      const h = halo(0.55); piv.add(h);
      this.group.add(piv);
      this.lhBeams.push(piv);
    }
    for (const isl of lay.islands) {
      if (isl === lhIsl || isl.tag) { if (isl.tag) this.dressSmall(isl, landPts); if (isl.tag && isl.kind === 'sandbar') this.beachJunk(L, isl, rng); continue; }
      const zone = lay.zoneId(isl.z);
      const pal = PAL[zone];
      const kind = isl.kind;
      const big = isl.r;
      if ((kind === 'tropical' || kind === 'dune') && pal.palms > 0) {
        const n = Math.round((kind === 'dune' ? 1 : 2.2) * big * pal.palms + rng.range(0, 1.5));
        for (const [x, , z] of landPts(isl, n, 0.08, 0.9)) this.ctx.palms.push({ x, z, s: rng.range(0.75, 1.15) * Math.min(1.2, 0.7 + big * 0.25), rot: Math.atan2(-(z - isl.z), x - isl.x) + rng.range(-0.6, 0.6) });
      }
      // a fishing hut on stilts at the edge of some tropical islands
      if ((kind === 'tropical' || kind === 'harbor') && big > 1.0 && rng.chance(0.45)) {
        for (let k = 0; k < 10; k++) {
          const a = rng.range(0, Math.PI * 2);
          const x = isl.x + Math.cos(a) * (isl.r * 1.05 + 0.25), z = isl.z + Math.sin(a) * (isl.r * 0.85 + 0.25);
          const g = lay.sampleG(x, z);
          if (g > -0.05 || g < -1.4 || lay.clearance(x, z, 0.8, 0.55) < 0.2) continue;
          const from = L.count;
          stiltHut(L, rng.int(0, 1e6));
          place(L, from, [x, 0, z], Math.atan2(-(z - isl.z), x - isl.x) + Math.PI);
          this.ctx.halos.push([x + Math.cos(a) * 0.3, 0.55, z + Math.sin(a) * 0.3]);
          break;
        }
      }
      if (kind === 'harbor') {
        for (const [x, g, z] of landPts(isl, rng.int(1, 3), 0.15, 0.5)) {
          const rot = rng.range(0, 6.28);
          box(L, [x, g + 0.16, z], [0.36, 0.34, 0.3], rng.chance(0.5) ? A.wallWin : A.wallDoor, rot);
          const r1 = L.count; box(L, [0, 0, 0], [0.42, 0.025, 0.2], A.redPaint); place(L, r1, [x - Math.sin(rot) * 0.075, g + 0.38, z - Math.cos(rot) * 0.075], rot, 1, -0.5);
          const r2 = L.count; box(L, [0, 0, 0], [0.42, 0.025, 0.2], A.redPaint); place(L, r2, [x + Math.sin(rot) * 0.075, g + 0.38, z + Math.cos(rot) * 0.075], rot, 1, 0.5);
          this.ctx.halos.push([x, g + 0.2, z]);
        }
      }
      if (kind === 'snow' || kind === 'harbor' || (kind === 'rocky' && zone !== 'reef' && zone !== 'sunset')) {
        for (const [x, g, z] of landPts(isl, Math.round(big * (kind === 'snow' ? 3 : 1.5)), 0.12, 0.9)) this.pine(L, x, g, z, rng.range(0.6, 1.1), kind === 'snow' || zone === 'arctic');
      }
      if (kind === 'sandbar' || kind === 'dune') this.beachJunk(L, isl, rng);
      if (kind === 'volcanic') {
        const g = lay.sampleG(isl.x, isl.z);
        const glow = new THREE.Mesh(new THREE.CircleGeometry(isl.r * 0.18, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff6a2a').multiplyScalar(3) }));
        glow.position.set(isl.x, g + 0.03, isl.z);
        this.group.add(glow);
        const h = halo(isl.r * 0.9); h.position.set(isl.x, g + 0.2, isl.z); (h as THREE.Sprite).material = new THREE.SpriteMaterial({ map: textures().halo, color: '#ff7a3a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
        this.group.add(h);
      }
    }
  }
  /** driftwood, shells, starfish, a beached dinghy: sandbars shouldn't be bare */
  private beachJunk(L: Loft, isl: Island, rng: Rng) {
    const lay = this.lay;
    const pt = (rmax: number) => { for (let k = 0; k < 12; k++) { const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * isl.r * rmax; const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d; const g = lay.sampleG(x, z); if (g > 0.015) return [x, g, z] as const; } return null; };
    const log = pt(0.6);
    if (log) { const a = rng.range(0, 3.14), l = rng.range(0.25, 0.45); rod(L, [log[0] - Math.cos(a) * l / 2, log[1] + 0.02, log[2] - Math.sin(a) * l / 2], [log[0] + Math.cos(a) * l / 2, log[1] + 0.025, log[2] + Math.sin(a) * l / 2], 0.028, 0.02, 6, A.darkWood); rod(L, [log[0], log[1] + 0.03, log[2]], [log[0] + 0.08, log[1] + 0.1, log[2] + 0.05], 0.01, 0.006, 4, A.darkWood); }
    for (let k = 0; k < rng.int(2, 5); k++) { const p = pt(0.9); if (p) blob(L, [p[0], p[1] + 0.006, p[2]], 0.025, 0.012, 0.02, rng.chance(0.5) ? A.cream : A.coral, 6); }
    for (let k = 0; k < rng.int(1, 2); k++) {
      const p = pt(0.8); if (!p) continue;
      const a0 = rng.range(0, 6.28);
      for (let i = 0; i < 5; i++) { const a = a0 + (i / 5) * 6.28; rod(L, [p[0], p[1] + 0.008, p[2]], [p[0] + Math.cos(a) * 0.06, p[1] + 0.006, p[2] + Math.sin(a) * 0.06], 0.012, 0.004, 4, A.crab, false); }
    }
    if (rng.chance(0.35)) { const p = pt(0.4); if (p) { box(L, [p[0], p[1] + 0.05, p[2]], [0.12, 0.1, 0.12], A.crate, rng.range(0, 1)); } }
    if (isl.r > 0.6 && rng.chance(0.4)) { const p = pt(0.3); if (p) { const f = L.count; lathe(L, [[0.09, 0], [0.085, 0.06], [0.05, 0.065], [0.05, 0.12], [0.03, 0.12], [0.03, 0.15], [0.0, 0.16]], 8, A.cream, { capBot: true }); place(L, f, [p[0], p[1] - 0.01, p[2]]); } }
  }
  private dressSmall(isl: Island, landPts: (isl: Island, n: number, minG: number, maxSlope?: number) => [number, number, number][]) {
    const zone = this.lay.zoneId(isl.z);
    if (isl.kind === 'tropical' && PAL[zone].palms > 0) for (const [x, , z] of landPts(isl, 2, 0.1, 0.9)) this.ctx.palms.push({ x, z, s: 0.85, rot: Math.atan2(-(z - isl.z), x - isl.x) });
    if (isl.kind === 'snow' || (isl.kind === 'rocky' && zone !== 'reef' && zone !== 'sunset')) for (const [x, g, z] of landPts(isl, 2, 0.12, 0.9)) this.pine(this.ctx.L, x, g, z, 0.8, zone === 'arctic');
  }
  private pine(L: Loft, x: number, g: number, z: number, s: number, snow: boolean) {
    const from = L.count;
    rod(L, [0, -0.05, 0], [0, 0.2, 0], 0.025, 0.02, 5, A.darkWood);
    for (let k = 0; k < 3; k++) {
      const y0 = 0.12 + k * 0.17, r0 = 0.2 - k * 0.05;
      lathe(L, [[r0 * 0.4, y0], [r0, y0 + 0.02], [r0 * 0.75, y0 + 0.08], [0.0, y0 + 0.26 - k * 0.03]], 9, A.moss, { capBot: true, g: gid() });
      if (snow) lathe(L, [[r0 * 0.55, y0 + 0.1], [r0 * 0.5, y0 + 0.12], [0.0, y0 + 0.26 - k * 0.03 + 0.005]], 9, A.snow, { capBot: true });
    }
    place(L, from, [x, g, z], x * 3.1, s);
  }

  // ------------------------------------------------------------------ instanced dressing: palms, rocks, coral, kelp, grass, bushes
  private instanced() {
    const lay = this.lay, T = textures(), rng = new Rng(this.map.seed ^ 0x77aa);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, items: { x: number; y: number; z: number; ry: number; s: number | [number, number, number]; rx?: number; rz?: number; c?: THREE.Color }[], shadow = true) => {
      if (!items.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, items.length);
      items.forEach((it, i) => {
        e.set(it.rx ?? 0, it.ry, it.rz ?? 0, 'YXZ');
        const sc = typeof it.s === 'number' ? s.set(it.s, it.s, it.s) : s.set(it.s[0], it.s[1], it.s[2]);
        m4.compose(p.set(it.x, it.y, it.z), q.setFromEuler(e), sc);
        im.setMatrixAt(i, m4);
        if (it.c) im.setColorAt(i, it.c);
      });
      im.castShadow = shadow; im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      return im;
    };
    // palms (3 variants)
    const trunkMat = this.reg(dio(new THREE.MeshStandardMaterial({ map: T.atlas.map, roughness: 0.85 }), { sway: 'palm', key: 'trunk' }));
    const crownMat = this.reg(dio(new THREE.MeshStandardMaterial({ map: T.foliage, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }), { sway: 'palm', key: 'crown' }));
    const pv = [0, 1, 2].map((k) => palmGeometry(this.map.seed + k * 31));
    const byV: { x: number; y: number; z: number; ry: number; s: number }[][] = [[], [], []];
    for (const pl of this.ctx.palms) { const g = lay.sampleG(pl.x, pl.z); if (g < 0.02) continue; byV[rng.int(0, 2)].push({ x: pl.x, y: g - 0.03, z: pl.z, ry: pl.rot, s: pl.s }); }
    byV.forEach((items, k) => { mk(pv[k].trunk, trunkMat, items); mk(pv[k].crown, crownMat, items); });
    // rocks (4 variants), tinted per zone
    const rockMat = this.reg(dio(new THREE.MeshStandardMaterial({ map: T.rock, roughness: 0.9 })));
    const rv = [0, 1, 2, 3].map((k) => rockGeometry(this.map.seed + k * 17));
    const rocks: { x: number; y: number; z: number; ry: number; s: number; c: THREE.Color }[][] = [[], [], [], []];
    for (const r of lay.rocks) {
      const c = new THREE.Color(PAL[lay.zoneIds[Math.min(r.zone, lay.zoneIds.length - 1)]].rock[3]).multiplyScalar(1.45);
      rocks[r.seed % 4].push({ x: r.x, y: r.h - r.s * 0.55, z: r.z, ry: r.rot, s: r.s, c });
    }
    rocks.forEach((items, k) => mk(rv[k], rockMat, items));
    // coral voxels on the reef shelves
    const coralFactor = (z: number) => blendNum(this.pals, lay.zoneW(z), (pp) => pp.coral);
    const cubes: { x: number; y: number; z: number; ry: number; s: number; c: THREE.Color }[] = [];
    const CORAL = ['#ff6a8a', '#ff9a4a', '#ffd84a', '#b86aff', '#4ae0d0', '#ff4a6a', '#f0f0ff', '#6a9aff'];
    const head = (x: number, z: number, kindR: number) => {
      const g = lay.sampleG(x, z);
      if (g > -0.15 || g < -1.6) return;
      const col = new THREE.Color(rng.pick(CORAL));
      const kind = rng.int(0, 2);
      const vs = rng.range(0.045, 0.07);
      const n = kind === 0 ? rng.int(6, 14) : rng.int(8, 18);
      for (let i = 0; i < n; i++) {
        let dx = 0, dy = 0, dz = 0;
        if (kind === 0) { dx = rng.int(-2, 2) * vs; dz = rng.int(-2, 2) * vs; dy = Math.max(0, 2 - Math.hypot(dx, dz) / vs) * vs * rng.range(0.5, 1); }
        else if (kind === 1) { const a = rng.range(0, 6.28), h = rng.int(0, 5); dx = Math.round(Math.cos(a) * h * 0.4) * vs; dz = Math.round(Math.sin(a) * h * 0.4) * vs; dy = h * vs; }
        else { dx = rng.int(-1, 1) * vs; dz = rng.int(-1, 1) * vs; dy = rng.int(0, 3) * vs; }
        const cc = col.clone().multiplyScalar(rng.range(0.75, 1.2));
        cubes.push({ x: x + dx, y: g + dy + vs * 0.4, z: z + dz, ry: 0, s: vs * rng.range(0.85, 1.05), c: cc });
      }
      void kindR;
    };
    for (let i = 0; i < 900; i++) {
      const x = rng.range(-lay.W / 2 + 0.8, lay.W / 2 - 0.8), z = rng.range(lay.zBack + 1, lay.zFront - 0.3);
      if (rng.next() > coralFactor(z)) continue;
      const g = lay.sampleG(x, z);
      if (g < -1.3 || g > -0.18) continue;
      head(x, z, 1);
    }
    for (const c of this.ctx.coral) for (let i = 0; i < c.n; i++) { const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * c.r; head(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, 1); }
    const coralMat = this.reg(dio(new THREE.MeshStandardMaterial({ roughness: 0.55, emissive: '#000000' }), { caustics: 1.2 }));
    if (this.night > 0.5) { coralMat.emissive.set('#3a6aff'); coralMat.emissiveIntensity = 0.3; }
    mk(new THREE.BoxGeometry(1, 1, 1), coralMat, cubes, false);
    // kelp
    const kelpFactor = (z: number) => blendNum(this.pals, lay.zoneW(z), (pp) => pp.kelp);
    const kelps: { x: number; y: number; z: number; ry: number; s: [number, number, number] }[] = [];
    const addKelp = (x: number, z: number) => { const g = lay.sampleG(x, z); if (g > -0.5) return; kelps.push({ x, y: g, z, ry: rng.range(0, 6.28), s: [rng.range(0.8, 1.3), -g + rng.range(-0.05, 0.04), rng.range(0.8, 1.3)] }); };
    // kelp grows in forests: a few dense patches rather than an even sprinkle
    for (let i = 0; i < 160; i++) {
      const cx = rng.range(-lay.W / 2 + 1.2, lay.W / 2 - 1.2), cz = rng.range(lay.zBack + 1.5, lay.zFront - 1);
      if (rng.next() > kelpFactor(cz) * 0.35) continue;
      if (!lay.isWater(cx, cz, 0.4, 1.0)) continue;
      const pr = rng.range(0.5, 1.3), n = Math.round(pr * pr * 14);
      for (let k = 0; k < n; k++) {
        const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * pr;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (lay.clearance(x, z, 0.4, 0.2) < 0 || !lay.isWater(x, z, 0.15, 0.8)) continue;
        addKelp(x, z);
      }
    }
    for (const k of this.ctx.kelp) addKelp(k.x, k.z);
    const kelpMat = this.reg(dio(new THREE.MeshStandardMaterial({ map: T.foliage, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, color: '#9aa870' }), { sway: 'kelp', caustics: 0.8 }));
    const kg = kelpGeometry(this.map.seed);
    kg.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(kg.getAttribute('position').count).fill(1), 1));
    mk(kg, kelpMat, kelps, false);
    // grass tufts on islands + seagrass meadows
    const tuft = new THREE.BufferGeometry();
    {
      const L = new Loft();
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI;
        const dx = Math.cos(a) * 0.09, dz = Math.sin(a) * 0.09;
        const grid = [0, 1].map((i) => [0, 1].map((j) => [dx * (j * 2 - 1), i * 0.16, dz * (j * 2 - 1)] as [number, number, number]));
        const g = gid();
        const ids = grid.map((row, i) => row.map((pt, j) => L.vert(pt, F.grass.x + j * F.grass.w, F.grass.y + (1 - i) * F.grass.h, undefined, g)));
        L.tri(ids[0][0], ids[0][1], ids[1][1]); L.tri(ids[0][0], ids[1][1], ids[1][0]);
      }
      const bg = L.build();
      for (const k of ['position', 'normal', 'uv']) tuft.setAttribute(k, bg.getAttribute(k));
      tuft.setIndex(bg.getIndex());
      const na = tuft.getAttribute('normal') as THREE.BufferAttribute;
      for (let i = 0; i < na.count; i++) na.setXYZ(i, 0, 1, 0);
      tuft.setAttribute('aW', new THREE.BufferAttribute(new Float32Array(na.count).fill(0.6), 1));
    }
    const grassMat = this.reg(dio(new THREE.MeshStandardMaterial({ map: T.foliage, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 }), { sway: 'palm', swayK: 6, key: 'grass' }));
    const tufts: { x: number; y: number; z: number; ry: number; s: number; c?: THREE.Color }[] = [];
    for (const isl of lay.islands) {
      const veg = isl.kind === 'tropical' || isl.kind === 'harbor' || isl.kind === 'dune' || isl.kind === 'rocky';
      if (!veg) continue;
      const zone = lay.zoneId(isl.z);
      if (zone === 'arctic') continue;
      const gc = new THREE.Color(PAL[zone].grass[2]).multiplyScalar(isl.kind === 'dune' ? 1.3 : 1.15);
      const n = Math.round(isl.r * isl.r * (isl.kind === 'dune' ? 6 : 10));
      for (let k = 0; k < n * 3 && tufts.length < 2500; k++) {
        const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * isl.r;
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
        const g = lay.sampleG(x, z);
        if (g < (isl.kind === 'dune' ? 0.12 : 0.08)) continue;
        if (lay.cellOf(lay.rocky, x, z) > 0.6 && rng.chance(0.7)) continue;
        tufts.push({ x, y: g - 0.01, z, ry: rng.range(0, 6.28), s: rng.range(0.7, 1.3), c: gc.clone().multiplyScalar(rng.range(0.8, 1.1)) });
      }
    }
    for (let i = 0; i < 700 && tufts.length < 3200; i++) {
      const x = rng.range(-lay.W / 2 + 0.6, lay.W / 2 - 0.6), z = rng.range(lay.zBack + 1, lay.zFront - 0.3);
      const zone = lay.zoneId(z);
      if (zone !== 'reef' && zone !== 'kelp' && zone !== 'sunset' && zone !== 'harbor') continue;
      const g = lay.sampleG(x, z);
      if (g > -0.25 || g < -2.2) continue;
      const c = new THREE.Color(zone === 'kelp' ? '#8aaa4a' : '#a8d070').multiplyScalar(1.2);
      for (let k = 0; k < 3; k++) tufts.push({ x: x + rng.range(-0.2, 0.2), y: g - 0.01, z: z + rng.range(-0.2, 0.2), ry: rng.range(0, 6.28), s: rng.range(0.9, 1.6), c });
    }
    mk(tuft, grassMat, tufts, false);
    // bushes
    const bushL = new Loft();
    blob(bushL, [0, 0.06, 0], 0.13, 0.1, 0.12, A.moss, 9, 0.35, 3);
    blob(bushL, [0.08, 0.05, 0.04], 0.08, 0.07, 0.08, A.moss, 8, 0.3, 5);
    const bushGeo = bushL.build(); bushGeo.deleteAttribute('color');
    const bushMat = this.reg(dio(new THREE.MeshStandardMaterial({ map: T.atlas.map, roughness: 0.9 })));
    const bushes: { x: number; y: number; z: number; ry: number; s: number; c: THREE.Color }[] = [];
    for (const isl of lay.islands) {
      if (isl.kind !== 'tropical' && isl.kind !== 'harbor' && isl.kind !== 'rocky') continue;
      const zone = lay.zoneId(isl.z);
      if (zone === 'arctic') continue;
      const c = new THREE.Color(PAL[zone].grass[1]).multiplyScalar(2.4);
      for (let k = 0; k < isl.r * 6; k++) {
        const a = rng.range(0, 6.28), d = Math.sqrt(rng.next()) * isl.r * 0.9;
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
        const g = lay.sampleG(x, z);
        if (g < 0.15 || lay.clearance(x, z, 0.4, 0.3) < 0) continue;
        bushes.push({ x, y: g - 0.03, z, ry: rng.range(0, 6.28), s: rng.range(0.6, 1.2), c: c.clone().multiplyScalar(rng.range(0.85, 1.1)) });
      }
    }
    mk(bushGeo, bushMat, bushes);
  }

  // ------------------------------------------------------------------ current ribbons
  private ribbonGeo() {
    const lay = this.lay;
    const pos: number[] = [], uv: number[] = [], st: number[] = [], ln: number[] = [], id: number[] = [], idx: number[] = [];
    let index = 0;
    for (const c of lay.curves.values()) {
      const dock = c.a < 0;
      const s0 = dock ? 0.35 : this.map.nodes[c.a].type === 'boss' ? 1.0 : 0.42;
      const s1 = c.len - (this.map.nodes[c.b].type === 'boss' ? 1.15 : 0.42);
      if (s1 - s0 < 0.2) continue;
      const w = this.map.nodes[c.b].type === 'boss' ? 0.5 : 0.38;
      const base = pos.length / 3;
      const N = Math.max(4, Math.round((s1 - s0) / 0.1));
      for (let i = 0; i <= N; i++) {
        const s = s0 + ((s1 - s0) * i) / N;
        const p = lay.along(c, s);
        const nx = -p.tz, nz = p.tx;
        for (const side of [0, 1]) {
          const k = side * 2 - 1;
          pos.push(p.x + nx * k * w * 0.5, 0, p.z + nz * k * w * 0.5);
          uv.push(side, s - s0);
          st.push(0); ln.push(s1 - s0); id.push(index);
        }
        if (i < N) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      this.ribbons.set(c.key, { key: c.key, a: c.a, b: c.b, index, v0: base, v1: pos.length / 3 });
      index++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const state = new Float32Array(st);
    geo.setAttribute('aState', new THREE.BufferAttribute(state, 1));
    geo.setAttribute('aLen', new THREE.Float32BufferAttribute(ln, 1));
    geo.setAttribute('aId', new THREE.Float32BufferAttribute(id, 1));
    geo.setIndex(idx);
    return { geo, state };
  }
  /** 0 locked, 1 available, 2 travelled, 3 dim */
  setRibbon(key: string, state: number) {
    const r = this.ribbons.get(key);
    if (!r) return;
    for (let i = r.v0; i < r.v1; i++) this.ribState[i] = state;
    (this.ribGeo.getAttribute('aState') as THREE.BufferAttribute).needsUpdate = true;
  }

  // ------------------------------------------------------------------ per frame
  /** move the cutaway to z (clamped to the slab front) and refresh the cross-section profile */
  setCut(z: number) {
    const lay = this.lay;
    z = Math.min(z, lay.zFront);
    this.cutZ = z;
    this.cut.constant = z;
    DIO.uDCutZ.value = z;
    this.cap.position.z = z + 0.004;
    this.capU.uCapZ.value = z;
    const N = this.profN;
    for (let i = 0; i < N; i++) {
      const x = -lay.W / 2 + ((i + 0.5) / N) * lay.W;
      this.prof[i * 4] = lay.sampleG(x, z);
      this.prof[i * 4 + 1] = lay.cellOf(lay.veg, x, z);
      this.prof[i * 4 + 2] = lay.cellOf(lay.rocky, x, z);
    }
    this.profTex.needsUpdate = true;
    // cross-section palette at the cut
    const w = lay.zoneW(z), P = this.pals, U = this.capU;
    blendCol(P, w, (p) => p.capWater[0], U.uW0.value); blendCol(P, w, (p) => p.capWater[1], U.uW1.value); blendCol(P, w, (p) => p.capWater[2], U.uW2.value);
    blendCol(P, w, (p) => p.strata[0], U.uS0.value); blendCol(P, w, (p) => p.strata[1], U.uS1.value); blendCol(P, w, (p) => p.strata[2], U.uS2.value); blendCol(P, w, (p) => p.strata[3], U.uS3.value);
    blendCol(P, w, (p) => p.bed[3], U.uSand.value); blendCol(P, w, (p) => p.bed[1], U.uSandD.value); blendCol(P, w, (p) => p.grass[2], U.uGrass.value);
    blendCol(P, w, (p) => p.strata[2], U.uSoil.value); U.uSoil.value.multiplyScalar(0.8);
    blendCol(P, w, (p) => p.rock[2], U.uRockC.value);
    blendCol(P, w, (p) => p.bedrock, U.uBedrock.value); blendCol(P, w, (p) => p.ore[0], U.uOre0.value); blendCol(P, w, (p) => p.ore[1], U.uOre1.value); blendCol(P, w, (p) => p.ore[2], U.uOre2.value);
    blendCol(P, w, (p) => p.plankton, U.uPlankC.value); blendCol(P, w, (p) => p.foam, U.uFoamC.value);
    // wrecks the cut passes through
    let nw = 0;
    for (const wr of this.ctx.wrecks) {
      if (nw >= 4) break;
      const s = Math.sin(wr.rot), c = Math.cos(wr.rot);
      if (Math.abs(s) < 0.2) continue;
      const u = (wr.z - z) / s;           // distance along the hull axis (+ toward the bow)
      if (Math.abs(u) > 1.15) continue;
      const t = (u + 1.2) / 2.4;
      const half = 0.4 * Math.min(Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (t - 0.42) / 0.58), 1.7)), 0.72), 0.7 + 0.3 * Math.sin(Math.min(1, t / 0.4) * Math.PI / 2));
      const depth = 0.5 * (1 - 0.55 * Math.pow(t, 4));
      const keel = wr.keel + 0.5 - depth + u * Math.sin(wr.pitch);
      if (half < 0.05) continue;
      U.uWr.value[nw].set(wr.x + u * c, keel, half / Math.abs(s), depth + 0.02);
      nw++;
    }
    U.uWrN.value = nw;
    U.uKelp.value = 0.12 + blendNum(P, w, (p) => p.kelp) * 0.55;
    blendCol(P, w, (p) => p.grass[0], U.uKelpC.value); U.uKelpC.value.lerp(blendCol(P, w, (p) => p.capWater[2]), 0.35);
    blendCol(P, w, (p) => p.capWater[2], U.uFishC.value); U.uFishC.value.multiplyScalar(0.55);
  }

  /** light + grade follow the zone under the camera */
  setLook(focusZ: number) {
    const w = this.lay.zoneW(focusZ), P = this.pals;
    blendCol(P, w, (p) => p.sun, this.sun.color);
    this.sun.intensity = blendNum(P, w, (p) => p.sunI);
    blendCol(P, w, (p) => p.hemiSky, this.hemi.color);
    blendCol(P, w, (p) => p.hemiGround, this.hemi.groundColor);
    this.hemi.intensity = blendNum(P, w, (p) => p.hemiI);
    DIO.uDSunCol.value.copy(this.sun.color);
    DIO.uDNight.value = blendNum(P, w, (p) => p.night);
    const sunK = this.sun.intensity / 2.6;
    this.capU.uLight.value.copy(this.sun.color).multiplyScalar(0.55 * sunK).add(this.hemi.color.clone().multiplyScalar(0.42 * this.hemi.intensity));
  }

  update(dt: number, t: number, cam: THREE.Camera, focus: THREE.Vector3) {
    DIO.uDTime.value = t;
    for (const f of this.ctx.floaters) {
      f.obj.position.y = f.y0 + Math.sin(t * 1.6 + f.ph) * f.amp;
      f.obj.rotation.set(Math.sin(t * 1.2 + f.ph) * f.roll, f.yaw + (f.spin ? t * f.spin : 0), Math.cos(t * 1.4 + f.ph * 1.7) * f.roll * 0.7, 'YXZ');
    }
    for (const b of this.lhBeams) b.rotation.y = t * 0.55;
    for (const b of this.ctx.beams) b.obj.rotation.y = b.base + Math.sin(t * b.speed) * (b.sweep ?? 0.6);
    this.life.update(dt, t);
    for (const m of this.markers) m.update(dt, t, cam);
    // keep the shadow frustum on the action
    const d = DIO.uDSunDir.value;
    this.sun.position.set(focus.x + d.x * 40, d.y * 40, focus.z + d.z * 40);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();
    void lerp;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat && !Array.isArray(mat) && mat !== this.atlasMat) mat.dispose();
    });
    for (const m of this.mats) m.dispose();
    for (const d of this.disposables) d.dispose();
    this.profTex.dispose();
  }
}
