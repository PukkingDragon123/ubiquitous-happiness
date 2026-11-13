// Small life at the play plane, cheap and instanced (one draw call per critter mesh, re-posed only near the camera):
//   gobies     - perch on the sand, hop in short arcs, bolt away in a long hop when the blobfish comes close;
//   crabs      - scuttle sideways, pause, wave a claw, run for it when bothered;
//   shrimp     - hover in little groups near rocks, flick backwards with a tail-flip when approached;
//   nudibranchs- bright sea slugs creeping back and forth over the rock tops (paths ray-cast onto the rocks).
// Plus moray eels (reef, kelp) that peek out of holes in rocks just behind the play plane, gape, look at the
// blobfish, snap now and then, and pull back into their den when it swims too close.
import * as THREE from 'three';
import type { World } from '../game/types';
import type { Scenery } from './scenery';
import { Soup, V3, mat4 } from '../world/lp';
import { Rng } from '../core/rng';
import { clamp, damp, smooth } from '../core/math';
import { buildFish, FishModel } from '../fish';
import { TAU, rgb01, critterSkin, castSoup } from './kit';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** one instanced critter mesh */
export class Herd {
  mesh: THREE.InstancedMesh;
  dirty = false;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, public n: number, name: string) {
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.count = n;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.name = name;
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, _c.setRGB(1, 1, 1));
  }
  set(i: number, x: number, y: number, z: number, yaw: number, pitch = 0, roll = 0, s = 1, sy = s) {
    _e.set(pitch, yaw, roll, 'YXZ'); _q.setFromEuler(_e);
    this.mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(s, sy, s)));
    this.dirty = true;
  }
  setM(i: number, m: THREE.Matrix4) { this.mesh.setMatrixAt(i, m); this.dirty = true; }
  color(i: number, c: [number, number, number]) { this.mesh.setColorAt(i, _c.setRGB(c[0], c[1], c[2])); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
  commit() { if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; } }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

// ------------------------------------------------------------------ meshes (local: +x forward, y up, base on y = 0)
/** a flat fin: both windings so it shows from either side on a front-sided material */
function fin(s: Soup, a: V3, b: V3, c: V3) { s.tri(a, b, c, [0, 0], [1, 0], [1, 1]); s.tri(a, c, b, [0, 0], [1, 1], [1, 0]); }

function gobyGeo(sk: { u0: number; v0: number; u1: number; v1: number }) {
  const s = new Soup();
  const path: V3[] = [[-0.12, 0.032, 0], [-0.06, 0.034, 0], [0, 0.036, 0], [0.06, 0.036, 0], [0.11, 0.03, 0]];
  const R = [0.012, 0.022, 0.03, 0.03, 0.016];
  // body with dark saddles (vertex shade bands), pale belly comes from the lit facets
  s.color(1, 1, 1).tube(path, (t) => R[Math.min(4, Math.round(t * 4))] * (0.85 + 0.15 * Math.sin(t * 3)), 5, sk, { shade: (t) => (Math.abs(t - 0.3) < 0.07 || Math.abs(t - 0.6) < 0.07 ? 0.5 : 1), base: true });
  s.lathe([[0.016, 0], [0, 0.02]], 5, sk); s.transformSince(s.count - 15, mat4(0.11, 0.03, 0, 1, 1, 1, 0, 0, -Math.PI / 2));
  s.color(0.85, 0.85, 0.85);
  fin(s, [-0.12, 0.034, 0], [-0.2, 0.07, 0], [-0.2, 0.0, 0]);             // tail
  fin(s, [0.02, 0.06, 0], [-0.04, 0.062, 0], [-0.01, 0.092, 0]);          // first dorsal
  fin(s, [-0.05, 0.058, 0], [-0.1, 0.045, 0], [-0.08, 0.075, 0]);         // second dorsal
  for (const side of [-1, 1]) fin(s, [0.05, 0.018, side * 0.024], [0.0, 0.0, side * 0.05], [0.06, 0.0, side * 0.045]); // perching pectorals
  s.color(0.08, 0.08, 0.1).box([0.075, 0.05, -0.022], [0.02, 0.02, 0.044], sk);  // eyes on top of the head
  return s.geometry();
}

function crabGeo(sk: { u0: number; v0: number; u1: number; v1: number }) {
  const s = new Soup();
  const f = s.count;
  s.color(1, 1, 1).lathe([[0.1, 0], [0.115, 0.022], [0.09, 0.045], [0.045, 0.058], [0, 0.062]], 7, sk, { sz: 0.72, base: true });
  s.transformSince(f, mat4(0, 0.05, 0, 1, 1, 1));
  s.color(0.82, 0.82, 0.82);
  for (const side of [-1, 1]) for (const z of [-0.05, -0.018, 0.016, 0.048]) {
    const k = 1 + Math.abs(z) * 2;
    s.tube([[side * 0.08, 0.065, z], [side * 0.16 * k, 0.11, z * 1.4], [side * 0.21 * k, 0.0, z * 1.7]], () => 0.011, 3, sk, { tip: true });
  }
  // claws held up in front (toward +z), white-tipped
  for (const side of [-1, 1]) {
    s.color(0.9, 0.9, 0.9).tube([[side * 0.05, 0.07, 0.06], [side * 0.1, 0.09, 0.12], [side * 0.075, 0.1, 0.17]], () => 0.016, 4, sk);
    const g = s.count;
    s.lathe([[0.03, 0], [0.034, 0.03], [0.02, 0.06], [0, 0.07]], 5, sk, { sz: 0.6 });
    s.transformSince(g, mat4(side * 0.075, 0.1, 0.17, 1, 1, 1, side * 0.3, Math.PI / 2 - 0.3, 0));
    s.color(0.95, 0.95, 0.92).tube([[side * 0.07, 0.12, 0.2], [side * 0.065, 0.135, 0.24]], () => 0.01, 3, sk, { tip: true });
  }
  s.color(0.06, 0.06, 0.08);
  for (const side of [-1, 1]) s.box([side * 0.03 - 0.008, 0.1, 0.055], [0.016, 0.03, 0.016], sk);
  return s.geometry();
}

function shrimpGeo(sk: { u0: number; v0: number; u1: number; v1: number }, glow: boolean) {
  const s = new Soup();
  const path: V3[] = [[-0.12, 0.03, 0], [-0.08, 0.05, 0], [-0.03, 0.062, 0], [0.02, 0.06, 0], [0.07, 0.05, 0], [0.1, 0.045, 0]];
  s.color(1, 1, 1).tube(path, (t) => 0.01 + Math.sin(t * Math.PI * 0.85) * 0.016, 5, sk, { shade: (t) => (Math.floor(t * 7) % 2 ? 0.86 : 1), base: true });
  s.color(1.6, 1.6, 1.6).tube(path.map((p) => [p[0], p[1] + 0.017, p[2]] as V3).slice(1, 5), () => 0.006, 3, sk);  // white dorsal stripe
  s.color(0.95, 0.95, 0.95);
  fin(s, [-0.12, 0.03, 0], [-0.17, 0.06, 0.03], [-0.17, 0.01, -0.03]);
  fin(s, [-0.12, 0.03, 0], [-0.17, 0.06, -0.03], [-0.17, 0.01, 0.03]);
  s.tube([[0.1, 0.048, 0], [0.15, 0.06, 0]], () => 0.004, 3, sk, { tip: true });             // rostrum
  s.color(1.5, 1.5, 1.5);
  for (const side of [-1, 1]) {                                                                // long white feelers
    s.tube([[0.1, 0.05, side * 0.008], [0.16, 0.09, side * 0.03], [0.1, 0.13, side * 0.06], [-0.05, 0.12, side * 0.09]], () => 0.0035, 3, sk);
  }
  s.color(0.8, 0.8, 0.8);
  for (let k = 0; k < 4; k++) for (const side of [-1, 1]) s.tube([[0.04 - k * 0.025, 0.04, side * 0.008], [0.05 - k * 0.025, 0.0, side * 0.03]], () => 0.003, 3, sk);
  s.color(0.05, 0.05, 0.06).box([0.085, 0.055, -0.018], [0.014, 0.014, 0.036], sk);
  if (glow) { s.glow(2.4).color(0.4, 0.9, 1.6); for (let k = 0; k < 4; k++) s.box([-0.06 + k * 0.035, 0.035, 0.014], [0.008, 0.008, 0.006], sk); s.glow(0); }
  return s.geometry();
}

/** sea slugs: A Spanish-shawl (purple, orange cerata), B chromodorid (blue, yellow rim, white gills), C aeolid (white, orange-tipped cerata) */
function slugGeo(sk: { u0: number; v0: number; u1: number; v1: number }, v: 'A' | 'B' | 'C') {
  const s = new Soup();
  const body = v === 'A' ? rgb01('#8a3ad0', 1.2) : v === 'B' ? rgb01('#2a5ae8', 1.25) : rgb01('#e8e4f0', 1.1);
  const accent = v === 'A' ? rgb01('#ff7a1a', 1.3) : v === 'B' ? rgb01('#ffd030', 1.3) : rgb01('#ff8a20', 1.3);
  const f = s.count;
  s.color(...body).tube([[-0.1, 0, 0], [-0.05, 0, 0], [0.02, 0, 0], [0.08, 0, 0], [0.1, 0, 0]], (t) => 0.014 + Math.sin(t * Math.PI) * 0.024, 6, sk, { base: true });
  s.transformSince(f, mat4(0, 0.016, 0, 1, 0.6, 1.15));
  // mantle rim / foot skirt
  s.color(...(v === 'B' ? accent : body.map((c) => c * 0.8) as [number, number, number]));
  const rim: V3[] = [];
  for (let k = 0; k <= 8; k++) { const a = (k / 8) * TAU; rim.push([Math.cos(a) * 0.105, 0.006, Math.sin(a) * 0.04]); }
  for (let k = 0; k < 8; k++) { const a = rim[k], b = rim[k + 1], ai: V3 = [a[0] * 0.75, 0.014, a[2] * 0.7], bi: V3 = [b[0] * 0.75, 0.014, b[2] * 0.7]; s.quad(a, b, bi, ai, sk); s.quad(a, ai, bi, b, sk); }
  // rhinophores
  s.color(...(v === 'C' ? body : accent));
  for (const side of [-1, 1]) { const g = s.count; s.lathe([[0.007, 0], [0.005, 0.02], [0, 0.03]], 4, sk); s.transformSince(g, mat4(0.07, 0.025, side * 0.012, 1, 1, 1, 0, 0, -0.35)); }
  if (v === 'B') {
    s.color(1.4, 1.4, 1.35);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, g = s.count; s.lathe([[0.005, 0], [0, 0.028]], 3, sk); s.transformSince(g, mat4(-0.065 + Math.cos(a) * 0.008, 0.025, Math.sin(a) * 0.01, 1, 1, 1, a, 0, 0.5)); }
  } else {
    // cerata: two rows of finger-like papillae, body colour at the root, accent at the tip
    for (let k = 0; k < 5; k++) for (const side of [-1, 1]) {
      const x = -0.07 + k * 0.03, h = 0.032 + Math.sin((k / 4) * Math.PI) * 0.018, g = s.count;
      s.color(...(v === 'A' ? body : rgb01('#f0e8f0', 1.2))).lathe([[0.008, 0], [0.007, h * 0.55]], 3, sk);
      s.color(...accent).lathe([[0.007, h * 0.55], [0, h]], 3, sk);
      s.transformSince(g, mat4(x, 0.02, side * 0.013, 1, 1, 1, 0, side * 0.45, 0));
    }
  }
  return s.geometry();
}

// ------------------------------------------------------------------ the critters
interface Bug {
  h: Herd; i: number; kind: 'goby' | 'crab' | 'shrimp' | 'slug';
  x: number; y: number; z: number; hx: number; hz: number; yaw: number; s: number;
  vx: number; vy: number; vz: number; t: number; st: number; air: boolean; ph: number;
  path?: { p: V3[]; u: number; dir: number };
}

const MIX: Record<string, { goby: number; crab: number; shrimp: number; slug: [number, number, number]; gobyCol: string[]; crabCol: string[]; shrimpCol: string[]; shrimpGlow?: boolean; bright?: number }> = {
  reef: { goby: 44, crab: 26, shrimp: 40, slug: [12, 12, 9], gobyCol: ['#f0c830', '#9ad0f0', '#d8b080', '#f08a50'], crabCol: ['#e8703a', '#d84a3a', '#f0a050'], shrimpCol: ['#e8402a', '#f06040'] },
  kelp: { goby: 26, crab: 34, shrimp: 30, slug: [13, 7, 10], gobyCol: ['#c08048', '#9a9050', '#d0a070'], crabCol: ['#c8402a', '#a83a3a', '#d06a3a'], shrimpCol: ['#c86a4a', '#e0907a'] },
  graveyard: { goby: 18, crab: 34, shrimp: 30, slug: [6, 0, 9], gobyCol: ['#a8a08a', '#8a8a78'], crabCol: ['#8a6a5a', '#a0704a', '#7a7a6a'], shrimpCol: ['#d8c8b0', '#c8b090'] },
  arctic: { goby: 14, crab: 26, shrimp: 38, slug: [0, 0, 20], gobyCol: ['#8a7a6a', '#a06a5a'], crabCol: ['#e07a40', '#d86a3a'], shrimpCol: ['#f0a0a0', '#e88a8a'] },
  abyss: { goby: 0, crab: 22, shrimp: 34, slug: [0, 0, 0], gobyCol: ['#888'], crabCol: ['#fffaf0', '#f0e8e0'], shrimpCol: ['#ff4a3a', '#e83a4a'], shrimpGlow: true, bright: 1.7 },
};

export class Critters {
  group = new THREE.Group();
  herds: Herd[] = [];
  bugs: Bug[] = [];
  private eels: Eel[] = [];
  private r: Rng;
  private t = 0;
  private scareX = 0; private scareY = -999; private scareT = 0;

  constructor(public scen: Scenery, public w: World, seed: number) {
    this.r = new Rng(seed ^ 0xc417);
    const a = scen.a, mix = MIX[a.id] ?? MIX.reef, P = scen.props, r = this.r;
    const sk = critterSkin(P.A);
    const mat = scen.mats.prop;
    const sh = scen.shape;
    const herd = (geo: THREE.BufferGeometry, n: number, name: string) => { const h = new Herd(geo, mat, n, name); this.herds.push(h); this.group.add(h.mesh); return h; };
    const spread = (n: number, f: (x: number) => void) => { for (let i = 0; i < n; i++) f(r.range(sh.X0 + 6, sh.X1 - 6)); };
    // gobies on the open sand
    if (mix.goby) {
      const h = herd(gobyGeo(sk), mix.goby, 'gobies');
      let i = 0;
      spread(mix.goby, (x) => { const z = r.range(-1.7, 1.3); this.add(h, i, 'goby', x, z, r.range(1.0, 1.25)); h.color(i, rgb01(r.pick(mix.gobyCol))); i++; });
    }
    if (mix.crab) {
      const h = herd(crabGeo(sk), mix.crab, 'crabs');
      let i = 0;
      spread(mix.crab, (x) => { const z = r.range(-2.2, 1.5); this.add(h, i, 'crab', x, z, r.range(0.9, 1.3)); h.color(i, rgb01(r.pick(mix.crabCol), mix.bright ?? 1)); i++; });
    }
    if (mix.shrimp) {
      const h = herd(shrimpGeo(sk, !!mix.shrimpGlow), mix.shrimp, 'shrimp');
      // little groups round the rock feet near the plane
      const tops = scen.rockTops.filter((t) => t.z > -3 && t.z < 1);
      let i = 0;
      while (i < mix.shrimp) {
        const t = tops.length && r.chance(0.7) ? r.pick(tops) : null;
        const cx = t ? t.x + r.sign() * t.r * 0.9 : r.range(sh.X0 + 6, sh.X1 - 6), cz = t ? t.z + r.range(0.2, 0.8) : r.range(-1.5, 1);
        for (let k = 0; k < r.int(3, 5) && i < mix.shrimp; k++, i++) { this.add(h, i, 'shrimp', cx + r.range(-0.5, 0.5), cz + r.range(-0.3, 0.3), r.range(1.0, 1.3)); h.color(i, rgb01(r.pick(mix.shrimpCol), mix.bright ?? 1)); }
      }
    }
    // nudibranchs creep over the rocks by the plane: paths ray-cast onto the rock surfaces
    const nSlug = mix.slug[0] + mix.slug[1] + mix.slug[2];
    if (nSlug) {
      const tops = scen.rockTops.filter((t) => t.z > -3.2 && t.z < 1.2);
      (['A', 'B', 'C'] as const).forEach((v, vi) => {
        const n = mix.slug[vi];
        if (!n || !tops.length) return;
        const h = herd(slugGeo(sk, v), n, 'slugs' + v);
        for (let i = 0; i < n; i++) {
          const t = r.pick(tops), a0 = r.range(0, TAU), L = Math.min(0.9, t.r * 0.9);
          const ch = scen.chunk(t.x), pts: V3[] = [];
          for (let k = 0; k <= 6; k++) {
            const u = k / 6 - 0.5, px = t.x + Math.cos(a0) * L * u + r.range(-0.03, 0.03), pz = t.z + Math.sin(a0) * L * u * 0.6;
            const o: V3 = [px, t.y + 3, pz], d: V3 = [0, -1, 0];
            const hit = Math.min(castSoup(ch.rock, o, d, 6) ?? 99, castSoup(ch.rockFar, o, d, 6) ?? 99);
            const y = hit < 99 ? o[1] - hit : this.ground(px, pz);
            pts.push([px, Math.max(y, this.ground(px, pz)) + 0.004, pz]);
          }
          this.add(h, i, 'slug', pts[3][0], pts[3][2], r.range(0.9, 1.25));
          this.bugs[this.bugs.length - 1].path = { p: pts, u: r.range(0, 1), dir: r.sign() };
        }
      });
    }
    if (a.id === 'reef' || a.id === 'kelp') this.dens();
    this.group.name = 'critters';
    for (const b of this.bugs) this.pose(b, 0);
    for (const h of this.herds) h.commit();
  }

  private add(h: Herd, i: number, kind: Bug['kind'], x: number, z: number, s: number) {
    const y = this.ground(x, z);
    this.bugs.push({ h, i, kind, x, y, z, hx: x, hz: z, yaw: kind === 'crab' ? this.r.range(-0.4, 0.4) : this.r.range(0, TAU), s, vx: 0, vy: 0, vz: 0, t: this.r.range(0, 4), st: 0, air: false, ph: this.r.range(0, 10) });
  }

  /** the live seabed height: the rest shape plus whatever explosions dug out of the sand strip */
  ground(x: number, z: number) {
    const S = this.scen.sand;
    return this.scen.heightAt(x, z) + (S.heightAt(x) - S.restAt(x)) * smooth(-2.6, -0.6, z);
  }

  /** something big went off: everything nearby bolts */
  scare(x: number, y: number, r: number) { this.scareX = x; this.scareY = y; this.scareT = 0.6 + r * 0.05; for (const e of this.eels) if (Math.hypot(e.mx - x, e.my - y) < r + 3) e.hide(3); }

  // ------------------------------------------------------------------ eels
  private dens() {
    const scen = this.scen, sh = scen.shape, r = this.r;
    const n = 4;
    for (let k = 0; k < n; k++) {
      let x = sh.X0 + 14 + (k + r.range(0.2, 0.8)) * ((sh.X1 - sh.X0 - 28) / n);
      const z = r.range(-2.7, -1.9);
      for (let tries = 0; tries < 6 && scen.isReserved(x, z, 2); tries++) x += 7;
      if (scen.isReserved(x, z, 2)) continue;
      const gy = scen.heightAt(x, z), R = r.range(1.3, 1.7), H = R * r.range(1.0, 1.25);
      const ch = scen.chunk(x), f0 = ch.rock.count;
      scen.addRock(r.pick(scen.shapes('bigboulder')), x, gy - R * 0.3, z, R, H, R * 1.1, r.range(0, TAU), { topK: 1.1 });
      const f1 = ch.rock.count;
      const side = k % 2 ? 1 : -1;
      const dir = new THREE.Vector3(side, 0.08, 0.5).normalize();
      const c = new THREE.Vector3(x, gy - R * 0.3 + H * 0.38, z);
      const o = c.clone().addScaledVector(dir, 5);
      const t = castSoup(ch.rock, [o.x, o.y, o.z], [-dir.x, -dir.y, -dir.z], 6, f0, f1);
      const mouth = t === null ? c.clone().addScaledVector(dir, R * 0.7) : o.clone().addScaledVector(dir, -t);
      // the den: a dark hole in the rock face
      const hole = new Soup(), bl = scen.props.get('black');
      for (let q = 0; q < 9; q++) {
        const a0 = (q / 9) * TAU, a1 = ((q + 1) / 9) * TAU;
        hole.tri([0, 0, 0], [Math.cos(a0) * 0.24, Math.sin(a0) * 0.17, 0], [Math.cos(a1) * 0.24, Math.sin(a1) * 0.17, 0], [bl.u0, bl.v0], [bl.u1, bl.v0], [bl.u1, bl.v1], 0.2, 0.2, 0.2);
      }
      const hm = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir)).setPosition(mouth.x - dir.x * 0.02, mouth.y - dir.y * 0.02, mouth.z - dir.z * 0.02);
      ch.prop.append(hole, hm);
      try {
        const eel = new Eel(buildFish('moray', (x * 31) | 0), mouth, dir, r.range(0.55, 0.68), r);
        this.group.add(eel.m.group);
        this.eels.push(eel);
      } catch (e) { console.warn('eel', e); }
      // a little cleaner-shrimp life around the den mouth is handled by the shrimp groups (rock tops)
    }
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number, camX: number) {
    this.t += dt;
    const p = this.w.player, w = this.w;
    this.scareT = Math.max(0, this.scareT - dt);
    for (const b of this.bugs) {
      if (Math.abs(b.x - camX) > 17) continue;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy * 1.3) - Math.abs(b.z) * 0.15;
      const scared = d < (b.kind === 'goby' ? 1.7 : b.kind === 'shrimp' ? 1.5 : 1.9) || (this.scareT > 0 && Math.hypot(b.x - this.scareX, b.y - this.scareY) < 6);
      const away = Math.sign(this.scareT > 0 && !(d < 2) ? b.x - this.scareX : dx) || 1;
      b.t -= dt; b.ph += dt;
      switch (b.kind) {
        case 'goby': {
          if (b.air) {
            b.vy -= 7 * dt; b.x += b.vx * dt; b.z += b.vz * dt; b.y += b.vy * dt;
            const g = this.ground(b.x, b.z);
            if (b.y <= g && b.vy < 0) { b.y = g; b.air = false; b.t = this.r.range(1.2, 4.5); if (Math.abs(b.x - camX) < 9 && this.r.chance(0.5)) w.fx.emit('dust', b.x, g + 0.03, { n: 1, spread: 0.05, vy: 0.2, life: 0.8, size: 0.05, color: this.scen.a.pal.silt, z: b.z }); }
          } else {
            b.y = this.ground(b.x, b.z);
            if (scared || b.t <= 0) {
              const far = scared ? this.r.range(0.9, 1.5) : this.r.range(0.25, 0.6);
              let dirx = scared ? away : (this.r.chance(0.5) ? 1 : -1);
              if (!scared && Math.abs(b.x - b.hx) > 3) dirx = Math.sign(b.hx - b.x);
              const T = scared ? 0.55 : 0.38;
              b.vx = (dirx * far) / T; b.vz = clamp((b.hz - b.z) * 0.5 + this.r.range(-0.3, 0.3), -0.6, 0.6) * (far / T) * 0.3; b.vy = (scared ? 1.9 : 1.3);
              b.air = true; b.yaw = Math.atan2(-b.vz, b.vx);
            }
          }
          this.pose(b, b.air ? clamp(b.vy * 0.25, -0.5, 0.5) : 0);
          break;
        }
        case 'crab': {
          if (scared && b.st <= 0) { b.st = 1.1; b.vx = away * 1.3; }
          if (b.st > 0) b.st -= dt;
          else if (b.t <= 0) { b.t = this.r.range(0.8, 3.2); b.vx = this.r.chance(0.45) ? 0 : (Math.abs(b.x - b.hx) > 2.5 ? Math.sign(b.hx - b.x) : this.r.sign()) * this.r.range(0.18, 0.35); }
          b.x += b.vx * dt;
          b.y = this.ground(b.x, b.z);
          const walk = Math.abs(b.vx) > 0.01, bob = walk ? Math.abs(Math.sin(b.ph * (b.st > 0 ? 30 : 16))) * 0.012 : 0;
          this.pose(b, 0, walk ? Math.sin(b.ph * 16) * 0.06 : 0, bob);
          if (b.st <= 0 && b.vx === 0 && Math.sin(b.ph * 0.7) > 0.96) this.pose(b, -0.12, 0, 0);   // claw-wave pose: rear up
          break;
        }
        case 'shrimp': {
          const g = this.ground(b.x, b.z);
          if (scared && b.st <= 0) { b.st = 0.5; const back = -Math.cos(b.yaw); b.vx = (Math.abs(back) > 0.2 ? back : away) * 2.6; b.vy = 1.0; }
          if (b.st > 0) { b.st -= dt; b.vx = damp(b.vx, 0, 3, dt); b.vy -= 3 * dt; }
          else {
            if (b.t <= 0) { b.t = this.r.range(1, 3); b.vx = Math.abs(b.x - b.hx) > 1.2 ? Math.sign(b.hx - b.x) * 0.15 : this.r.range(-0.12, 0.12); if (Math.abs(b.vx) > 0.03) b.yaw = b.vx > 0 ? this.r.range(-0.5, 0.5) : Math.PI + this.r.range(-0.5, 0.5); }
            b.vy = ((g + 0.05 + Math.sin(b.ph * 1.3) * 0.03) - b.y) * 3;
          }
          b.x += b.vx * dt; b.y = Math.max(g, b.y + b.vy * dt);
          this.pose(b, b.st > 0 ? -0.5 : Math.sin(b.ph * 2) * 0.05);
          break;
        }
        case 'slug': {
          const P = b.path!;
          P.u += P.dir * dt * 0.012;
          if (P.u > 1 || P.u < 0) { P.dir = -P.dir; P.u = clamp(P.u, 0, 1); }
          const f = P.u * (P.p.length - 1), i0 = Math.min(P.p.length - 2, Math.floor(f)), t = f - i0, a = P.p[i0], c = P.p[i0 + 1];
          b.x = a[0] + (c[0] - a[0]) * t; b.y = a[1] + (c[1] - a[1]) * t; b.z = a[2] + (c[2] - a[2]) * t;
          const fx = (c[0] - a[0]) * P.dir, fz = (c[2] - a[2]) * P.dir, fy = (c[1] - a[1]) * P.dir;
          b.yaw = Math.atan2(-fz, fx);
          this.pose(b, Math.atan2(fy, Math.hypot(fx, fz)) * 0.8, 0, 0, 1 + Math.sin(b.ph * 2.2) * 0.04);
          break;
        }
      }
    }
    for (const h of this.herds) h.commit();
    for (const e of this.eels) e.update(dt, camX, w, this.t);
  }

  /** yaw about y, then nose-up pitch about the critter's own side axis, then roll about its length */
  private pose(b: Bug, pitch: number, roll = 0, lift = 0, stretch = 1) {
    _q.setFromAxisAngle(_p.set(0, 1, 0), b.yaw);
    if (pitch) _q.multiply(_qa.setFromAxisAngle(_p.set(0, 0, 1), pitch));
    if (roll) _q.multiply(_qa.setFromAxisAngle(_p.set(1, 0, 0), roll));
    b.h.setM(b.i, _m.compose(_p.set(b.x, b.y + lift, b.z), _q, _s.set(b.s * stretch, b.s, b.s)));
  }

  dispose() {
    for (const h of this.herds) h.dispose();
    for (const e of this.eels) e.m.dispose();
    this.group.removeFromParent();
  }
}

// ------------------------------------------------------------------ moray eels in their dens
class Eel {
  ext = 0.35; extT = 0.35; state: 'out' | 'hide' | 'peek' | 'snap' = 'out'; st = 0; next: number; hideT = 0;
  mx: number; my: number;
  private q = new THREE.Quaternion();
  constructor(public m: FishModel, public mouth: THREE.Vector3, public dir: THREE.Vector3, public sc: number, r: Rng) {
    m.group.scale.setScalar(sc);
    m.mesh.castShadow = false;
    this.q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    m.group.quaternion.copy(this.q);
    this.next = r.range(3, 8);
    this.mx = mouth.x; this.my = mouth.y;
  }
  hide(t: number) { this.state = 'hide'; this.hideT = t; }
  update(dt: number, camX: number, w: World, t: number) {
    const g = this.m.group;
    if (Math.abs(this.mouth.x - camX) > 18) { g.visible = false; return; }
    const p = w.player, d = Math.hypot(p.x - this.mx, p.y - this.my);
    this.st += dt; this.next -= dt;
    const near = d < 2.7;
    switch (this.state) {
      case 'out':
        this.extT = 0.38 + Math.sin(t * 0.6 + this.mx) * 0.06;
        this.m.setJaw(0.25 + 0.3 * Math.max(0, Math.sin(t * 1.7 + this.mx)));   // morays gape to breathe
        if (near) this.hide(2.2);
        else if (this.next <= 0 && d < 9) { this.state = 'snap'; this.st = 0; if (Math.abs(this.mx - camX) < 10) w.sfx(Math.random() < 0.5 ? 'chomp1' : 'snap1', this.mx, 0.25, 1.2); }
        break;
      case 'snap':
        this.extT = 0.7; this.m.setJaw(this.st < 0.16 ? 1.15 : 0);
        if (this.st > 0.4) { this.state = 'out'; this.next = 4 + Math.random() * 7; }
        break;
      case 'hide':
        this.extT = -0.25; this.m.setJaw(0);
        this.hideT -= dt;
        if (near) this.hideT = Math.max(this.hideT, 1.2);
        if (this.hideT <= 0) { this.state = 'peek'; this.st = 0; }
        break;
      case 'peek':
        this.extT = 0.16; this.m.setJaw(0.15);
        if (near) this.hide(2);
        else if (this.st > 1.4) this.state = 'out';
        break;
    }
    const k = this.state === 'snap' ? 18 : this.state === 'hide' ? 9 : 2.2;
    this.ext = damp(this.ext, this.extT, k, dt);
    g.visible = this.ext > -0.2;
    const L = this.m.length * this.sc;
    // the nose pokes `ext` metres out of the hole; the rest of the body stays inside the rock
    g.position.copy(this.mouth).addScaledVector(this.dir, this.ext - L * 0.5);
    this.m.lookAt(p.x - this.mx, p.y - this.my);
    this.m.update(dt, 0.25 + Math.abs(this.ext - this.extT) * 3, Math.sin(t * 0.8 + this.mx) * 0.25);
  }
}
