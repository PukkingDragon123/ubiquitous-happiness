// Builds the static, layered environment of an area:
//   far   (z -40..-80)  silhouette spires and ridges fading into the water colour;
//   back  (z -16..-42)  rising seabed, outcrops, dense flora;
//   mid   (z -3..-16)   rocks, landmarks, the bulk of the flora;
//   play  (z -1..1)     the deformable sand strip, rocks with collision, rooted plants that ride the sand;
//   fg    (z 1.3..2.7)  framing plants and pebbles between the camera and the plane;
//   front (z = 3)       the cross-section wall: the sand layer over the strata.
// Static meshes are merged per 30 m chunk and per material (rock / ground / flora / props), so the whole area
// is a few dozen draw calls and frustum culling works per chunk.
import * as THREE from 'three';
import type { AreaDef, FloraRule } from './defs';
import type { Shape } from './shape';
import { SEAM_Z } from './shape';
import { Soup, mat4 } from '../world/lp';
import { Atlas } from '../world/atlas';
import { FloraKit, SPECIES } from '../world/flora';
import { boulder, spire, arch, crustPainter, pillows } from '../world/rockgen';
import { rockTile, groundTile, strataTile, sectionTile } from '../world/texlib';
import { floraMaterial, rockMaterial, groundMaterial, sectionMaterial, propMaterial } from '../world/mats';
import type { SandField } from '../world/sand';
import type { AreaTerrain } from '../world/areaTerrain';
import { FRONT_Z } from '../gfx/water/surface';
import { Rng } from '../core/rng';
import { smooth, fbm, hash2 } from '../core/math';
import { hex } from '../gfx/px';
import { PropKit } from './props';

export const CHUNK = 30;
export const ZONES: Record<string, [number, number]> = { fg: [1.3, 2.7], play: [-0.95, 0.9], mid: [-2.6, -16], back: [-16, -42] };
const ZONE_K: Record<string, number> = { fg: 0.35, play: 0.55, mid: 2.2, back: 2.4 };

interface Chunk { rock: Soup; flora: Soup; prop: Soup; glow: Soup }

const rgb = (c: string, k = 1): [number, number, number] => { const h = hex(c); return [h[0] / 255 * k, h[1] / 255 * k, h[2] / 255 * k]; };

export class Scenery {
  group = new THREE.Group();
  floraAtlas: Atlas;
  propAtlas: Atlas;
  flora: FloraKit;
  props: PropKit;
  mats: { rock: THREE.MeshStandardMaterial; ground: THREE.MeshStandardMaterial; sandStrip: THREE.MeshStandardMaterial; section: THREE.MeshStandardMaterial; strata: THREE.MeshStandardMaterial; flora: THREE.MeshStandardMaterial; prop: THREE.MeshStandardMaterial; propSway: THREE.MeshStandardMaterial; glass: THREE.MeshStandardMaterial; cloth: THREE.MeshStandardMaterial };
  private chunks = new Map<number, Chunk>();
  rng: Rng;
  /** extra builders (landmarks) can add their own meshes / per-frame updates */
  updaters: ((dt: number, camX: number, t: number) => void)[] = [];
  disposables: { dispose(): void }[] = [];
  /** x spans that rocks and big flora keep clear of (wreck, buoy, spawn) */
  reserved: { x: number; r: number; z0: number; z1: number }[] = [];
  /** rock tops other things can sit on (onRock flora) */
  rockTops: { x: number; y: number; z: number; r: number }[] = [];

  constructor(public a: AreaDef, public shape: Shape, public sand: SandField, public terrain: AreaTerrain, public seed: number) {
    this.rng = new Rng(seed ^ 0x5eed);
    this.floraAtlas = new Atlas(256, 256);
    this.propAtlas = new Atlas(512, 512);
    this.props = new PropKit(this.propAtlas, a);
    this.flora = new FloraKit(this.floraAtlas, a);
    const rt = rockTile(a), gt = groundTile(a);
    this.mats = {
      rock: rockMaterial(rt),
      ground: groundMaterial(gt, rt),
      sandStrip: groundMaterial(gt, rt, { dynamic: true }),
      section: sectionMaterial(sectionTile(a), 0.5, true),
      strata: sectionMaterial(strataTile(a), 0.5),
      // atlases are painted while the area is built; finish() uploads them
      flora: floraMaterial(new THREE.Texture()),
      prop: propMaterial(new THREE.Texture()),
      propSway: propMaterial(new THREE.Texture(), { sway: true, side: THREE.DoubleSide }),
      glass: propMaterial(new THREE.Texture(), { rough: 0.15, metal: 0.1 }),
      cloth: propMaterial(new THREE.Texture(), { sway: true, side: THREE.DoubleSide, alphaTest: 0.5 }),
    };
    this.group.name = 'area-scenery';
    this.reserved.push({ x: shape.wreckX, r: 10, z0: -9, z1: 0.2 }, { x: shape.buoyX, r: 3, z0: -3, z1: 3 }, { x: shape.spawnX, r: 4, z0: -1.5, z1: 3 });
  }

  chunk(x: number): Chunk {
    const i = Math.floor(x / CHUNK);
    let c = this.chunks.get(i);
    if (!c) { c = { rock: new Soup(), flora: new Soup(), prop: new Soup(), glow: new Soup() }; this.chunks.set(i, c); }
    return c;
  }

  /** seabed height anywhere (rest state), consistent with the meshes */
  heightAt(x: number, z: number): number {
    if (z >= -0.6) return this.sand.restAt(x);
    if (z > SEAM_Z) { const k = smooth(SEAM_Z, -0.6, z); return this.shape.back(x, SEAM_Z) * (1 - k) + this.sand.restAt(x) * k; }
    return this.shape.back(x, z);
  }

  isReserved(x: number, z: number, pad = 0) {
    for (const r of this.reserved) if (Math.abs(x - r.x) < r.r + pad && z > r.z0 - pad && z < r.z1 + pad) return true;
    return false;
  }

  build() {
    this.buildSandStrip();
    this.buildSection();
    this.buildGround();
    this.buildRocks();
    this.buildFar();
    for (const rule of this.a.flora) this.placeFlora(rule);
  }

  // ------------------------------------------------------------------ the gameplay sand strip
  private buildSandStrip() {
    const S = this.sand, rows = [FRONT_Z, 2.2, 1.4, 0.6, -0.2, -1.0, -1.8, -2.7, SEAM_Z];
    const step = 0.5, cols = Math.floor((S.x1 - S.x0) / step) + 1;
    const pos: number[] = [], col: number[] = [], w: number[] = [], idx: number[] = [];
    const s = this.seed % 997;
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < cols; c++) {
      const x = S.x0 + c * step, z = rows[r];
      let y = this.heightAt(x, z);
      // faceted irregularity (never on the front edge, which must meet the cross-section wall)
      if (r > 0) y += (hash2(c, r, s) - 0.5) * 0.08;
      pos.push(x, y, z);
      const k = 0.88 + fbm(x * 0.15, z * 0.3, 2, s) * 0.24;
      col.push(k, k, k);
      w.push(1);
    }
    for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      if ((r + c) & 1) idx.push(a, b, d, b, e, d); else idx.push(a, e, d, a, b, e);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('aSandW', new THREE.Float32BufferAttribute(w, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();
    // the sand moves on the GPU: give it generous bounds
    g.boundingSphere!.radius += 6;
    const m = new THREE.Mesh(g, this.mats.sandStrip);
    m.receiveShadow = true;
    m.name = 'sand-strip';
    this.group.add(m);
    this.disposables.push(g);
  }

  // ------------------------------------------------------------------ the cross-section wall at the front of the slab
  private buildSection() {
    const S = this.sand, step = 0.5, cols = Math.floor((S.x1 - S.x0) / step) + 1;
    const sp: number[] = [], sw: number[] = [], sc: number[] = [], si: number[] = [];
    const tp: number[] = [], tc: number[] = [], ti: number[] = [];
    const depth = 16;
    for (let c = 0; c < cols; c++) {
      const x = S.x0 + c * step, top = S.restAt(x), bed = S.bedAt(x);
      sp.push(x, top, FRONT_Z, x, bed - 0.05, FRONT_Z); sw.push(1, 0); sc.push(1, 1, 1, 0.8, 0.8, 0.8);
      tp.push(x, bed, FRONT_Z, x, bed - depth, FRONT_Z); tc.push(1, 1, 1, 0.55, 0.55, 0.6);
      if (c < cols - 1) { const a = c * 2; si.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); ti.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const mk = (p: number[], cl: number[], ix: number[], mat: THREE.Material, wts?: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      // tilt the cut's normals up so it catches the sun like a lit diorama section instead of a black slab
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(p.length).fill(0).map((_, i) => (i % 3 === 0 ? 0 : i % 3 === 1 ? 0.55 : 0.835)), 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cl, 3));
      if (wts) g.setAttribute('aSandW', new THREE.Float32BufferAttribute(wts, 1));
      g.setIndex(ix);
      g.computeBoundingSphere();
      g.boundingSphere!.radius += 4;
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.group.add(m);
      this.disposables.push(g);
    };
    mk(sp, sc, si, this.mats.section, sw);
    mk(tp, tc, ti, this.mats.strata);
  }

  // ------------------------------------------------------------------ the 3D seabed behind the strip
  private buildGround() {
    const sh = this.shape;
    const rows = [SEAM_Z, -4.8, -6, -7.5, -9.5, -12, -15, -19, -24, -30, -37, -45, -54, -64, -76, -90];
    const x0 = sh.X0 - 70, x1 = sh.X1 + 70, step = 1.6;
    const s = this.seed % 991;
    for (let cx = x0; cx < x1; cx += CHUNK) {
      const cols = Math.ceil(CHUNK / step) + 1;
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      for (let r = 0; r < rows.length; r++) for (let c = 0; c < cols; c++) {
        const z = rows[r];
        // farther rows: coarser jitter so the dunes break into PS1 facets
        const x = cx + c * step + (r > 0 && c > 0 && c < cols - 1 ? (hash2(Math.round(cx + c * step), r, s) - 0.5) * step * 0.5 : 0);
        let y = sh.back(x, z);
        if (r > 0) y += (hash2(Math.round(x * 4), r, s + 1) - 0.5) * (0.12 + Math.min(1, -z / 40) * 0.6);
        pos.push(x, y, z);
        const k = 0.85 + fbm(x * 0.06, z * 0.08, 2, s) * 0.3;
        col.push(k, k, k);
      }
      for (let r = 0; r < rows.length - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
        if ((r + c) & 1) idx.push(a, b, d, b, e, d); else idx.push(a, e, d, a, b, e);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mats.ground);
      m.receiveShadow = true;
      this.group.add(m);
      this.disposables.push(g);
    }
  }

  // ------------------------------------------------------------------ rocks
  /** append a sculpted rock: unit shape scaled to (sx, sy, sz) at a base point, tinted + crusted */
  addRock(shapeSoup: Soup, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, o: { topK?: number; tilt?: number; tint?: number } = {}) {
    const ch = this.chunk(x);
    const from = ch.rock.count;
    const tilt = o.tilt ?? 0;
    ch.rock.append(shapeSoup, mat4(x, y, z, sx, sy, sz, ry, (this.rng.next() - 0.5) * tilt, (this.rng.next() - 0.5) * tilt));
    const t = o.tint ?? this.rng.range(0.85, 1.12);
    crustPainter([t, t * this.rng.range(0.97, 1.03), t * this.rng.range(0.96, 1.04)], rgb(this.a.pal.rockTop, 1.25), o.topK ?? 0.7, from, ch.rock);
    if (sy > 0.5) this.rockTops.push({ x, y: y + sy * 0.92, z, r: Math.min(sx, sz) * 0.6 });
  }

  private rockShapes = new Map<string, Soup[]>();
  shapes(kind: 'boulder' | 'slab' | 'spire' | 'arch' | 'pillow' | 'bigboulder', n = 6): Soup[] {
    let l = this.rockShapes.get(kind);
    if (!l) {
      l = [];
      const layered = this.a.rock === 'mudstone' || this.a.rock === 'limestone';
      for (let k = 0; k < n; k++) {
        const sd = this.seed * 13 + k * 101 + kind.length * 7;
        switch (kind) {
          case 'boulder': l.push(boulder(sd, { level: 1, rough: 0.4, cuts: 4, layers: layered ? 3 : 0 })); break;
          case 'bigboulder': l.push(boulder(sd, { level: 2, rough: 0.55, cuts: 9, cutLo: 0.5, layers: layered ? 5 : 0, recess: 0.12 })); break;
          case 'slab': l.push(boulder(sd, { level: 1, rough: 0.25, cuts: 3, box: 0.6, flat: 0.25, layers: layered ? 2 : 0 })); break;
          case 'spire': l.push(spire(sd, { sides: 7, rings: 8, waist: this.a.rock === 'limestone' ? 0.12 : 0.08, lean: (k % 3 - 1) * 0.25 })); break;
          case 'arch': l.push(arch(sd)); break;
          case 'pillow': l.push(pillows(sd)); break;
        }
      }
      this.rockShapes.set(kind, l);
    }
    return l;
  }

  private buildRocks() {
    const a = this.a, sh = this.shape, r = this.rng;
    // gameplay-plane rock clusters (with collision)
    for (let x = sh.X0 + 6; x < sh.X1 - 6; x += r.range(7, 13)) {
      if (this.isReserved(x, 0, 2)) continue;
      if (r.chance(a.id === 'graveyard' ? 0.45 : 0.25)) continue;
      const fl = this.sand.bedAt(x);
      const big = r.chance(0.35);
      const R = big ? r.range(1.3, 2.2) : r.range(0.6, 1.2);
      const kind = a.rock === 'pillow' ? 'pillow' : big ? 'bigboulder' : 'boulder';
      const shp = r.pick(this.shapes(kind));
      const H = R * r.range(0.9, 1.4);
      this.addRock(shp, x, fl - R * 0.25, r.range(-0.3, 0.2), R, H, R * r.range(1.0, 1.6), r.range(0, 6), { tilt: 0.3 });
      // collision: a couple of circles hugging the visible mass on the plane
      this.terrain.addRock({ x, y: fl - R * 0.25 + H * 0.45, r: Math.min(R, H) * 0.62 });
      if (big) this.terrain.addRock({ x: x + R * 0.45, y: fl + H * 0.2, r: R * 0.45 }), this.terrain.addRock({ x: x - R * 0.45, y: fl + H * 0.2, r: R * 0.45 });
      // scree around it
      for (let k = 0; k < r.int(2, 4); k++) {
        const xx = x + r.sign() * R * r.range(0.8, 1.6), zz = r.range(-1.6, 1.4);
        const s = r.range(0.15, 0.4);
        this.addRock(r.pick(this.shapes('boulder')), xx, this.heightAt(xx, zz) - s * 0.3, zz, s, s * r.range(0.6, 1), s, r.range(0, 6), { tilt: 0.8 });
      }
      // stacks / spires in the rockier areas
      if ((a.id === 'kelp' || a.id === 'arctic' || a.id === 'reef') && r.chance(0.25)) {
        const sx = x + r.sign() * R * 1.4, SH = r.range(3, 6), SR = r.range(0.8, 1.3);
        if (!this.isReserved(sx, 0, 1)) {
          const sb = this.sand.bedAt(sx);
          this.addRock(r.pick(this.shapes('spire')), sx, sb - 0.3, r.range(-0.6, -0.2), SR, SH, SR * 1.2, r.range(0, 6), { topK: 0.9 });
          for (let y = 0.6; y < SH - 0.3; y += 0.9) this.terrain.addRock({ x: sx, y: sb + y, r: SR * (1 - (y / SH) * 0.5) * 0.85 });
        }
      }
    }
    // mid + back rocks and outcrops (no collision)
    const nMid = Math.round((sh.X1 - sh.X0 + 60) / 3.2);
    for (let i = 0; i < nMid; i++) {
      const x = r.range(sh.X0 - 30, sh.X1 + 30), z = -r.range(2.8, 36) * (r.chance(0.5) ? 1 : 0.5) - 2.6;
      if (this.isReserved(x, z, 1)) continue;
      const far = -z / 36;
      const big = r.chance(0.18 + far * 0.3);
      const R = big ? r.range(1.6, 3.6) * (1 + far * 0.6) : r.range(0.4, 1.5);
      const kind = a.rock === 'pillow' && r.chance(0.6) ? 'pillow' : big ? 'bigboulder' : r.chance(0.3) ? 'slab' : 'boulder';
      const y = this.heightAt(x, z);
      this.addRock(r.pick(this.shapes(kind)), x, y - R * 0.3, z, R * r.range(0.8, 1.3), R * r.range(0.5, 1.1), R * r.range(0.8, 1.3), r.range(0, 6), { tilt: 0.4 });
    }
    // spires / sea stacks in the mid-background
    const nSp = Math.round((sh.X1 - sh.X0) / 18);
    for (let i = 0; i < nSp; i++) {
      const x = r.range(sh.X0 - 10, sh.X1 + 10), z = -r.range(8, 30);
      if (this.isReserved(x, z, 2)) continue;
      const y = this.heightAt(x, z), H = Math.min(r.range(5, 11), -y - 3.5);
      if (H < 2) continue;
      const R = r.range(1.2, 2.6);
      this.addRock(r.pick(this.shapes('spire')), x, y - 0.5, z, R, H, R * r.range(0.9, 1.3), r.range(0, 6), { topK: 1 });
    }
    // the cliffs that close the area at both ends
    for (const side of [-1, 1]) {
      const ex = side < 0 ? sh.X0 : sh.X1;
      for (let k = 0; k < 9; k++) {
        const x = ex + side * r.range(1, 14), z = r.range(-14, 1.5);
        const y = this.heightAt(x, Math.min(z, -0.7));
        const R = r.range(3, 6);
        this.addRock(r.pick(this.shapes('bigboulder')), x, y - R * 0.4, z, R, R * r.range(1.2, 2.2), R, r.range(0, 6), { tilt: 0.3 });
      }
    }
  }

  // ------------------------------------------------------------------ far silhouettes
  private buildFar() {
    const sh = this.shape, r = this.rng;
    for (let x = sh.X0 - 80; x < sh.X1 + 80; x += r.range(6, 14)) {
      const z = -r.range(42, 78);
      const y = sh.back(x, z);
      const tall = r.chance(0.45);
      const H = tall ? r.range(8, 22) : r.range(4, 9);
      const top = Math.min(y + H, -3.5);
      if (top - y < 2) continue;
      const R = tall ? r.range(3, 7) : r.range(5, 12);
      this.addRock(r.pick(this.shapes(tall ? 'spire' : 'bigboulder')), x, y - 1, z, R, top - y + 1, R * r.range(0.8, 1.4), r.range(0, 6), { topK: 0.6 });
    }
  }

  // ------------------------------------------------------------------ flora
  placeFlora(rule: FloraRule) {
    const S = SPECIES[rule.sp];
    if (!S) return;
    const variants = this.flora.get(rule.sp);
    const r = this.rng.fork(rule.sp.length * 977 + rule.per10 * 31);
    const W = this.shape.X1 - this.shape.X0 + 40;
    for (const zone of rule.zones) {
      const [z0, z1] = ZONES[zone];
      const total = Math.round(rule.per10 * (W / 10) * ZONE_K[zone]);
      const cl = Math.max(1, rule.cluster ?? 1);
      for (let c = 0; c < Math.ceil(total / cl); c++) {
        let cx = r.range(this.shape.X0 - 20, this.shape.X1 + 20), cz = r.range(Math.min(z0, z1), Math.max(z0, z1));
        let onRock: { x: number; y: number; z: number; r: number } | null = null;
        if (rule.onRock && this.rockTops.length && r.chance(0.6)) {
          const cand = this.rockTops.filter((t) => t.z <= Math.max(z0, z1) + 0.5 && t.z >= Math.min(z0, z1) - 0.5);
          if (cand.length) { onRock = r.pick(cand); cx = onRock.x; cz = onRock.z; }
        }
        for (let m = 0; m < cl; m++) {
          const x = cx + (r.next() + r.next() - 1) * (onRock ? onRock.r : 1.4);
          let z = cz + (r.next() + r.next() - 1) * (onRock ? onRock.r * 0.6 : 1.0);
          z = Math.max(Math.min(z0, z1), Math.min(Math.max(z0, z1), z));
          if (this.isReserved(x, z)) continue;
          // keep the gameplay band readable: nothing tall right on the plane
          if (zone === 'play' && S.tall && Math.abs(z) < 0.6) continue;
          let y = onRock ? onRock.y - 0.05 : this.heightAt(x, z) - 0.04;
          if (zone === 'fg' && !onRock) y = this.heightAt(x, z) - 0.04;
          const v = r.pick(variants);
          let sc = r.range(S.size[0], S.size[1]) * (rule.scale ? r.range(rule.scale[0], rule.scale[1]) : 1);
          if (zone === 'back') sc *= 1.25;
          let sy = sc;
          if (S.tall) {
            const col = -y;
            const reach = rule.sp === 'giantkelp' ? col - r.range(0.2, 1.6) : col * r.range(0.45, 0.75);
            if (reach < 2) continue;
            sy = reach / 10; sc = r.range(0.9, 1.25);
          }
          const tint = r.range(0.82, 1.12);
          const mtx = mat4(x, y, z, sc, sy, sc, r.range(0, Math.PI * 2), (r.next() - 0.5) * 0.15, (r.next() - 0.5) * 0.15);
          this.chunk(x).flora.append(v, mtx, { sway: true, tint: [tint, tint * r.range(0.95, 1.05), tint * r.range(0.93, 1.05)] });
        }
      }
    }
  }

  // ------------------------------------------------------------------ finish: merge chunk soups into meshes
  finish() {
    this.mats.flora.map = this.floraAtlas.texture(); this.mats.flora.needsUpdate = true;
    for (const m of [this.mats.prop, this.mats.propSway, this.mats.glass, this.mats.cloth]) { m.map = this.propAtlas.texture(); m.needsUpdate = true; }
    for (const [, c] of this.chunks) {
      const add = (s: Soup, mat: THREE.Material, cast: boolean, recv: boolean) => {
        if (!s.count) return;
        const g = s.geometry();
        const m = new THREE.Mesh(g, mat);
        m.castShadow = cast; m.receiveShadow = recv;
        // swaying / sand-riding vertices move on the GPU: pad the culling bounds
        if (g.boundingSphere) g.boundingSphere.radius += 3;
        this.group.add(m);
        this.disposables.push(g);
      };
      add(c.rock, this.mats.rock, true, true);
      add(c.flora, this.mats.flora, true, false);
      add(c.prop, this.mats.prop, true, true);
    }
    this.chunks.clear();
  }

  update(dt: number, camX: number, t: number) { for (const u of this.updaters) u(dt, camX, t); }

  dispose() {
    for (const d of this.disposables) d.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
    this.floraAtlas.texture().dispose();
    this.propAtlas.texture().dispose();
    this.group.removeFromParent();
  }
}
