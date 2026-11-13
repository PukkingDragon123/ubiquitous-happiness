// Things that move on (and under, and above) the diorama: boats sailing loops between the nodes with foamy
// wakes, gulls circling the islands with flapping wings, and schools of fish milling under the surface,
// visible through the water as dark shadows. All instanced or batched.
import * as THREE from 'three';
import { Loft, V3, ring, usFor } from '../gfx/loft';
import { Rng } from '../core/rng';
import { clamp, smooth, TAU } from '../core/math';
import { A } from './tex';
import { blob, membrane, gid } from './build';
import { ship, ShipKind } from './ships';
import { dio, wakeMaterial } from './shaders';
import type { Layout } from './layout';
import type { ZoneId } from './gen';

interface Boat { obj: THREE.Object3D; pts: [number, number][]; cum: number[]; len: number; s: number; speed: number; hist: [number, number][]; acc: number; beam: number; ph: number; stern: number }
interface Gull { cx: number; cz: number; r: number; h: number; w: number; ph: number; wob: number }
interface School { ax: number; az: number; bx: number; bz: number; fa: number; fb: number; p: number; q: number; n: number; r: number; spin: number; depth: number; first: number }

const BOATS: Record<ZoneId, ShipKind[]> = {
  reef: ['sailboat', 'rowboat', 'sailboat', 'dinghy'], kelp: ['rowboat', 'sailboat', 'fishing'], sunset: ['sailboat', 'sailboat', 'rowboat'],
  harbor: ['fishing', 'trawler', 'sailboat', 'fishing'], arctic: ['fishing', 'trawler'], abyss: ['trawler', 'fishing'], trench: ['trawler', 'trawler', 'fishing'],
};
const SPEED: Partial<Record<ShipKind, number>> = { rowboat: 0.22, dinghy: 0.26, canoe: 0.25, sailboat: 0.42, fishing: 0.36, trawler: 0.28 };
const WN = 36;

export class Life {
  group = new THREE.Group();
  boats: Boat[] = [];
  private wakeGeo: THREE.BufferGeometry;
  private wakePos: Float32Array;
  private wakeAttr: Float32Array;
  gulls: THREE.InstancedMesh;
  private gd: Gull[] = [];
  fish: THREE.InstancedMesh;
  private schools: School[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private sv = new THREE.Vector3(1, 1, 1);

  constructor(private lay: Layout, atlasMat: THREE.MeshStandardMaterial, extraSchools: { x: number; z: number; r: number }[], halo: (s: number) => THREE.Object3D) {
    const rng = new Rng(lay.map.seed ^ 0xb0a7);
    // ---------------- boats
    const nb = 5 + lay.map.act;
    for (let tries = 0; tries < 120 && this.boats.length < nb; tries++) {
      const cx = rng.range(-lay.W / 2 + 3, lay.W / 2 - 3), cz = rng.range(lay.zBack + 4, lay.zFront - 4);
      const rx = rng.range(1.6, 3.6), rz = rng.range(1.2, 3.2), rot = rng.range(0, TAU), wob = rng.range(0, 0.18), ph = rng.range(0, TAU);
      const pts: [number, number][] = [];
      let ok = true;
      for (let i = 0; i <= 72 && ok; i++) {
        const a = (i / 72) * TAU;
        const k = 1 + wob * Math.sin(a * 3 + ph);
        const lx = Math.cos(a) * rx * k, lz = Math.sin(a) * rz * k;
        const x = cx + lx * Math.cos(rot) - lz * Math.sin(rot), z = cz + lx * Math.sin(rot) + lz * Math.cos(rot);
        if (!lay.isWater(x, z, 0.45, 0.3) || lay.clearance(x, z, -0.2, -0.6) < 0) ok = false;
        for (const b of this.boats) if (Math.hypot(x - b.pts[0][0], z - b.pts[0][1]) < 0.01) ok = false;
        pts.push([x, z]);
      }
      if (!ok) continue;
      if (rng.chance(0.5)) pts.reverse();
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const kind = rng.pick(BOATS[lay.zoneId(cz)]);
      const L = new Loft();
      const out = ship(L, kind, rng.int(0, 1 << 30), { anglers: kind === 'rowboat' ? 1 : 1 });
      const mesh = new THREE.Mesh(L.build(), atlasMat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const g = new THREE.Group(); g.add(mesh);
      for (const l of out.lamps) { const h = halo(0.2); h.position.set(l[0], l[1], l[2]); g.add(h); }
      this.group.add(g);
      const len = cum[cum.length - 1];
      this.boats.push({ obj: g, pts, cum, len, s: rng.range(0, len), speed: SPEED[kind] ?? 0.3, hist: [], acc: 0, beam: out.len * 0.32, ph: rng.range(0, TAU), stern: out.len * 0.5 });
    }
    // wakes: one strip per boat
    const nv = this.boats.length * WN * 2;
    this.wakeGeo = new THREE.BufferGeometry();
    this.wakePos = new Float32Array(nv * 3);
    this.wakeAttr = new Float32Array(nv * 2);
    this.wakeGeo.setAttribute('position', new THREE.BufferAttribute(this.wakePos, 3).setUsage(THREE.DynamicDrawUsage));
    this.wakeGeo.setAttribute('aWake', new THREE.BufferAttribute(this.wakeAttr, 2).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let b = 0; b < this.boats.length; b++) for (let i = 0; i + 1 < WN; i++) {
      const a = (b * WN + i) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.wakeGeo.setIndex(idx);
    const wake = new THREE.Mesh(this.wakeGeo, wakeMaterial());
    wake.frustumCulled = false; wake.renderOrder = 3;
    this.group.add(wake);
    for (const b of this.boats) { const p = this.at(b, b.s); for (let i = 0; i < WN; i++) b.hist.push([p.x - p.tx * i * 0.001, p.z - p.tz * i * 0.001]); }

    // ---------------- gulls
    const gullL = new Loft();
    blob(gullL, [0, 0, 0], 0.085, 0.032, 0.03, A.white, 8);
    blob(gullL, [0.075, 0.018, 0], 0.03, 0.026, 0.024, A.white, 8);
    blob(gullL, [0.108, 0.014, 0], 0.016, 0.006, 0.006, A.yellow, 5);
    for (const s of [-1, 1]) {
      const W = (j: number) => j / 4;
      const grid: V3[][] = [0, 1].map((i) => [0, 1, 2, 3, 4].map((j): V3 => { const t = j / 4; return [0.03 - i * 0.06 - t * t * 0.05, 0.012 + Math.sin(t * Math.PI) * 0.018, s * (0.02 + t * 0.21)]; }));
      membrane(gullL, grid, A.white, (_i, j) => W(j));
      const tip: V3[][] = [0, 1].map((i) => [0, 1, 2].map((j): V3 => { const t = 0.75 + (j / 2) * 0.25; return [0.03 - i * 0.05 - t * t * 0.05, 0.012 + Math.sin(t * Math.PI) * 0.018 + 0.001, s * (0.02 + t * 0.21)]; }));
      membrane(gullL, tip, A.black, () => 1);
    }
    membrane(gullL, [[[-0.07, 0.005, -0.025], [-0.13, 0.0, -0.035]], [[-0.07, 0.005, 0.025], [-0.13, 0.0, 0.035]]], A.white, () => 0);
    const gg = gullL.build();
    gg.deleteAttribute('color');
    const gp = gg.getAttribute('position') as THREE.BufferAttribute;
    const gw = new Float32Array(gp.count);
    for (let i = 0; i < gp.count; i++) gw[i] = smooth(0.025, 0.12, Math.abs(gp.getZ(i)));
    gg.setAttribute('aW', new THREE.BufferAttribute(gw, 1));
    const gmat = dio(new THREE.MeshStandardMaterial({ map: atlasMat.map, roughness: 0.7, side: THREE.DoubleSide }), { sway: 'gull' });
    const ng = lay.map.act === 3 ? 6 : 14;
    this.gulls = new THREE.InstancedMesh(gg, gmat, ng);
    this.gulls.castShadow = true;
    this.gulls.frustumCulled = false;
    const anchors = lay.islands.filter((i) => i.r > 0.9);
    for (let i = 0; i < ng; i++) {
      const a = anchors.length ? rng.pick(anchors) : { x: rng.range(-5, 5), z: rng.range(lay.zBack, lay.zFront) };
      this.gd.push({ cx: a.x + rng.range(-1, 1), cz: a.z + rng.range(-1, 1), r: rng.range(0.9, 2.4), h: rng.range(1.8, 3.6), w: rng.range(0.35, 0.7) * rng.sign(), ph: rng.range(0, TAU), wob: rng.range(0.2, 0.6) });
    }
    this.group.add(this.gulls);

    // ---------------- fish schools
    const fishL = new Loft();
    const fg = gid();
    const rings = [-0.08, -0.05, -0.01, 0.03, 0.06].map((x, i) => {
      const k = [0.18, 0.75, 1, 0.85, 0.35][i];
      return { pts: ring([x, 0, 0], [0, 0, 1], [0, 1, 0], 0.012 * k, 0.026 * k, 0.022 * k, 8), v: i / 4 };
    });
    fishL.loft(rings, usFor(8), A.bluePaint, fg, { start: [-0.085, 0, 0], end: [0.08, -0.002, 0] });
    membrane(fishL, [[[-0.08, 0, 0], [-0.12, 0.03, 0]], [[-0.08, 0, 0], [-0.12, -0.028, 0]]], A.bluePaint, () => 1);
    membrane(fishL, [[[-0.02, 0.024, 0], [0.02, 0.022, 0]], [[-0.03, 0.04, 0], [0.0, 0.036, 0]]], A.bluePaint, () => 0.3);
    const fgeo = fishL.build();
    fgeo.deleteAttribute('color');
    const fp = fgeo.getAttribute('position') as THREE.BufferAttribute;
    const fw = new Float32Array(fp.count);
    for (let i = 0; i < fp.count; i++) fw[i] = smooth(0.02, -0.12, fp.getX(i));
    fgeo.setAttribute('aW', new THREE.BufferAttribute(fw, 1));
    const night = lay.map.act === 3;
    const fmat = dio(new THREE.MeshStandardMaterial({ color: night ? '#1a3a6a' : '#22405a', roughness: 0.5, emissive: night ? '#2a8aa8' : '#000000', emissiveIntensity: night ? 0.6 : 0 }), { sway: 'fish', caustics: 0.6 });
    const want: { x: number; z: number; r: number }[] = [...extraSchools];
    for (let i = 0; i < 70 && want.length < 9 + lay.map.act; i++) {
      const x = rng.range(-lay.W / 2 + 2, lay.W / 2 - 2), z = rng.range(lay.zBack + 3, lay.zFront - 2);
      if (lay.isWater(x, z, 0.8, 0.9)) want.push({ x, z, r: rng.range(0.4, 0.8) });
    }
    let total = 0;
    for (const w of want) {
      const n = rng.int(7, 14);
      let ax = 0, az = 0;
      for (let k = 0; k < 8; k++) {
        const tx = rng.range(0.4, 1.8), tz = rng.range(0.4, 1.8);
        let ok = true;
        for (let i = 0; i < 12 && ok; i++) { const t = (i / 12) * TAU; if (!lay.isWater(w.x + Math.sin(t) * tx, w.z + Math.sin(t * 1.3) * tz, w.r * 0.6, 0.55)) ok = false; }
        if (ok) { ax = tx; az = tz; break; }
      }
      this.schools.push({ ax: w.x, az: w.z, bx: ax, bz: az, fa: rng.range(0.04, 0.09), fb: rng.range(0.03, 0.08), p: rng.range(0, TAU), q: rng.range(0, TAU), n, r: w.r, spin: rng.range(0.5, 0.9) * rng.sign(), depth: rng.range(0.32, 0.6), first: total });
      total += n;
    }
    this.fish = new THREE.InstancedMesh(fgeo, fmat, Math.max(1, total));
    this.fish.count = total;
    this.fish.frustumCulled = false;
    this.group.add(this.fish);
    this.update(0, 0);
  }

  at(b: Boat, s: number) {
    s = ((s % b.len) + b.len) % b.len;
    let i = 1;
    while (i < b.cum.length - 1 && b.cum[i] < s) i++;
    const t = (s - b.cum[i - 1]) / (b.cum[i] - b.cum[i - 1] || 1);
    const [ax, az] = b.pts[i - 1], [bx, bz] = b.pts[i];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / l, tz: (bz - az) / l };
  }

  update(dt: number, t: number) {
    // ---- boats + wakes
    let wi = 0;
    for (const b of this.boats) {
      b.s += b.speed * dt;
      const p = this.at(b, b.s), p2 = this.at(b, b.s + 0.25);
      const yaw = Math.atan2(-(p2.z - p.z), p2.x - p.x);
      b.obj.position.set(p.x, Math.sin(t * 1.7 + b.ph) * 0.015, p.z);
      b.obj.rotation.set(Math.sin(t * 1.3 + b.ph) * 0.05, yaw, Math.sin(t * 1.1 + b.ph * 2) * 0.025, 'YXZ');
      const sx = p.x - p.tx * b.stern * 0.9, sz = p.z - p.tz * b.stern * 0.9;
      b.acc += dt;
      if (b.acc > 0.09) { b.acc = 0; b.hist.unshift([sx, sz]); b.hist.length = WN; }
      b.hist[0] = [sx, sz];
      for (let i = 0; i < WN; i++) {
        const [x, z] = b.hist[i], [x2, z2] = b.hist[Math.min(WN - 1, i + 1)];
        let dx = x - x2, dz = z - z2; const l = Math.hypot(dx, dz);
        if (l < 1e-5) { dx = p.tx; dz = p.tz; } else { dx /= l; dz /= l; }
        const age = i / (WN - 1);
        const w = b.beam * (0.45 + age * 2.2);
        for (const s of [-1, 1]) {
          const k = wi * 3;
          this.wakePos[k] = x - dz * w * s; this.wakePos[k + 1] = 0; this.wakePos[k + 2] = z + dx * w * s;
          this.wakeAttr[wi * 2] = age; this.wakeAttr[wi * 2 + 1] = s;
          wi++;
        }
      }
    }
    (this.wakeGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.wakeGeo.getAttribute('aWake') as THREE.BufferAttribute).needsUpdate = true;
    // ---- gulls
    for (let i = 0; i < this.gd.length; i++) {
      const g = this.gd[i];
      const a = g.ph + t * g.w;
      const r = g.r * (1 + Math.sin(t * 0.3 + g.ph) * 0.25);
      const x = g.cx + Math.cos(a) * r, z = g.cz + Math.sin(a) * r * 0.8;
      const y = g.h + Math.sin(t * 0.7 + g.ph) * g.wob;
      const tx = -Math.sin(a) * Math.sign(g.w), tz = Math.cos(a) * 0.8 * Math.sign(g.w);
      this.e.set(0, Math.atan2(-tz, tx), -Math.sign(g.w) * 0.35, 'YXZ');
      this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.sv.set(1.4, 1.4, 1.4));
      this.gulls.setMatrixAt(i, this.m);
    }
    this.gulls.instanceMatrix.needsUpdate = true;
    // ---- fish
    for (const s of this.schools) {
      const cx = s.ax + Math.sin(t * s.fa + s.p) * s.bx, cz = s.az + Math.sin(t * s.fb * 1.3 + s.q) * s.bz;
      for (let k = 0; k < s.n; k++) {
        const ph = (k / s.n) * TAU + Math.sin(k * 7.3) * 0.5;
        const rr = s.r * (0.35 + 0.65 * ((k * 0.618) % 1));
        const a = ph + t * s.spin * (1.2 - rr / s.r * 0.4);
        const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr * 0.8;
        const y = -s.depth - ((k * 0.37) % 1) * 0.15 + Math.sin(t * 2 + k) * 0.02;
        const tx = -Math.sin(a) * Math.sign(s.spin), tz = Math.cos(a) * 0.8 * Math.sign(s.spin);
        this.e.set(0, Math.atan2(-tz, tx), 0, 'YXZ');
        const sc = 0.9 + ((k * 0.73) % 1) * 0.5;
        this.m.compose(this.v.set(x, y, z), this.q.setFromEuler(this.e), this.sv.set(sc, sc, sc));
        this.fish.setMatrixAt(s.first + k, this.m);
      }
    }
    this.fish.instanceMatrix.needsUpdate = true;
    void clamp;
  }
}
