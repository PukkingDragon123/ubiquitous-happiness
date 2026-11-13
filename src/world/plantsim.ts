// Physically simulated seaweed near the camera. Every stipe and blade is a verlet chain: buoyancy floats it
// up, a bending stiffness pulls it back toward its grown shape, drag and a slowly gusting current push it
// around. The blobfish, creatures, divers and projectiles push through it (it parts around them and swings
// back, fluttering in their wake); explosions blast it outward; swords and harpoons cut blades and stipes,
// and the cut pieces float off with whatever was attached to them and fade.
//
// Plants are only simulated + drawn inside a window around the camera (far plants are the static,
// shader-swayed meshes built by the scenery). The geometry is re-skinned every frame into one dynamic mesh:
// stipes as 5-sided tubes, blades as 3-wide strips with a raised midrib (faceted, PS2-style), ruffled edges
// and their own faceted gas bladder, all mapped onto hand-painted atlas regions.
import * as THREE from 'three';
import type { UVR } from './lp';
import type { Entity, World } from '../game/types';
import { Rng } from '../core/rng';

type Kind = 'tube' | 'strip';
interface Chain {
  nodes: number[];
  rest: number;
  kind: Kind;
  /** radius (tube) or width (strip) along t */
  size: (t: number) => number;
  uv: UVR;
  buoy: number; stiff: number; drag: number;
  /** grown direction of each segment (unit, world) for the bending pull */
  dir: [number, number, number][];
  /** anchor (pinned root) or a parent node index */
  anchor: [number, number, number] | null; parent: number;
  /** strip orientation: initial side axis + twist along the blade */
  side: [number, number, number]; twist: number; ruffle: number;
  tint: number;
  free: boolean; age: number; dead: boolean;
  plant: SimPlant;
  /** blades riding on a cut-off piece fade and die with it */
  host?: Chain;
}
interface Bulb { node: number; r: number; uv: UVR }
export interface SimPlant { x: number; z: number; chains: Chain[]; bulbs: Bulb[]; on: boolean; ground: () => number; baseY: number; deadNodes?: Set<number> }

export interface SimRegions { stipe: UVR; blade: UVR; bladder: UVR; bull: UVR; bulb: UVR; grass: UVR; lettuce: UVR; whip: UVR; wrack: UVR }

const MAXV = 90000;

export class PlantSim {
  X = new Float32Array(4096); Y = new Float32Array(4096); Z = new Float32Array(4096);
  PX = new Float32Array(4096); PY = new Float32Array(4096); PZ = new Float32Array(4096);
  n = 0;
  plants: SimPlant[] = [];
  mesh: THREE.Mesh;
  private pos = new Float32Array(MAXV * 3); private uv = new Float32Array(MAXV * 2); private col = new Float32Array(MAXV * 3);
  private geo: THREE.BufferGeometry;
  private t = 0;
  /** current: base speed (m/s) along +x, gusting */
  current = 0.35;
  window = 17;
  /** tint multiplier for the next plants (dark foreground silhouettes) */
  tintK = 1;
  private prevE = new Map<Entity, [number, number]>();
  private rng = new Rng(4242);
  /** a cut happened (for sfx / fx by the owner) */
  onCut: ((x: number, y: number) => void) | null = null;

  constructor(material: THREE.Material, public R: SimRegions) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const nrm = new Float32Array(MAXV * 3); for (let i = 0; i < MAXV; i++) { nrm[i * 3 + 1] = 0.6; nrm[i * 3 + 2] = 0.8; }
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(MAXV * 4), 4));
    g.setAttribute('aGlow', new THREE.BufferAttribute(new Float32Array(MAXV), 1));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.name = 'plant-sim';
  }

  // ------------------------------------------------------------------ building plants
  private node(x: number, y: number, z: number) {
    if (this.n >= this.X.length) for (const k of ['X', 'Y', 'Z', 'PX', 'PY', 'PZ'] as const) { const a = new Float32Array(this.X.length * 2); a.set(this[k]); this[k] = a; }
    const i = this.n++;
    this.X[i] = this.PX[i] = x; this.Y[i] = this.PY[i] = y; this.Z[i] = this.PZ[i] = z;
    return i;
  }
  private chain(p: SimPlant, pts: [number, number, number][], o: Partial<Chain> & { kind: Kind; size: (t: number) => number; uv: UVR }, parent = -1): Chain {
    const nodes: number[] = [];
    const dir: [number, number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      nodes.push(parent >= 0 && i === 0 ? parent : this.node(pts[i][0], pts[i][1], pts[i][2]));
      if (i > 0) { const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], dz = pts[i][2] - pts[i - 1][2], l = Math.hypot(dx, dy, dz) || 1; dir.push([dx / l, dy / l, dz / l]); }
    }
    let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
    const c: Chain = {
      nodes, rest: L / (pts.length - 1), kind: o.kind, size: o.size, uv: o.uv, buoy: o.buoy ?? 1, stiff: o.stiff ?? 0.08, drag: o.drag ?? 2,
      dir, anchor: parent >= 0 ? null : [pts[0][0], pts[0][1], pts[0][2]], parent, side: o.side ?? [1, 0, 0], twist: o.twist ?? 0, ruffle: o.ruffle ?? 0,
      tint: (o.tint ?? 1) * this.tintK, free: false, age: 0, dead: false, plant: p,
    };
    p.chains.push(c);
    return c;
  }
  private plant(x: number, y: number, z: number, ground: () => number): SimPlant {
    const p: SimPlant = { x, z, chains: [], bulbs: [], on: false, ground, baseY: y };
    this.plants.push(p);
    return p;
  }

  /** a giant kelp: holdfast, a buoyant 5-sided stipe to near the surface, blades on bladders, a surface canopy */
  addGiantKelp(x: number, y: number, z: number, H: number, seed: number, ground: () => number) {
    const r = new Rng(seed), p = this.plant(x, y, z, ground), R = this.R;
    const segs = Math.max(6, Math.min(14, Math.round(H / 0.8)));
    const lean = r.range(-0.6, 0.6);
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push([x + lean * t * t + Math.sin(t * 4 + seed) * 0.15, y + t * H, z + Math.cos(t * 3 + seed) * 0.12]); }
    const st = this.chain(p, pts, { kind: 'tube', size: (t) => 0.05 * (1 - t * 0.35), uv: R.stipe, buoy: 2.2, stiff: 0.02, drag: 1.6 });
    let side = r.chance(0.5) ? 1 : -1;
    for (let j = 1; j <= segs; j++) {
      const per = j === segs ? 4 : r.int(1, 2);
      for (let k = 0; k < per; k++) {
        if (r.chance(0.7)) side = -side;
        const top = j >= segs - 1;
        const L = top ? r.range(1.4, 2.2) : r.range(0.8, 1.3);
        const a = r.range(-0.5, 0.5) + (side > 0 ? 0 : Math.PI);
        const up = top ? r.range(-0.15, 0.05) : r.range(0.3, 0.75);
        const d: [number, number, number] = [Math.cos(a) * (1 - up * 0.5), up, Math.sin(a) * 0.45];
        const n0 = st.nodes[j], b0: [number, number, number] = [this.X[n0], this.Y[n0], this.Z[n0]];
        const bp: [number, number, number][] = [b0];
        const nseg = top ? 5 : 4;
        for (let q = 1; q <= nseg; q++) { const t = q / nseg; bp.push([b0[0] + d[0] * L * t, b0[1] + d[1] * L * t - t * t * 0.15, b0[2] + d[2] * L * t]); }
        this.chain(p, bp, { kind: 'strip', size: (t) => (t < 0.08 ? 0.04 : 0.26 * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.92 + 0.1)), uv: R.blade, buoy: 0.5, stiff: 0.05, drag: 3, side: [-d[2], 0.25, d[0]], twist: r.range(-1.2, 1.2), ruffle: 0.35, tint: r.range(0.85, 1.1) }, n0);
        p.bulbs.push({ node: n0, r: 0.065, uv: R.bladder });
      }
    }
    return p;
  }

  /** a bull kelp: a long whip stipe, a big bulb, a ribbon fringe streaming downcurrent */
  addBullKelp(x: number, y: number, z: number, H: number, seed: number, ground: () => number) {
    const r = new Rng(seed), p = this.plant(x, y, z, ground), R = this.R;
    const segs = Math.max(6, Math.round(H / 0.9));
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segs; i++) { const t = i / segs; pts.push([x + Math.sin(t * 3 + seed) * 0.3, y + t * H, z]); }
    const st = this.chain(p, pts, { kind: 'tube', size: (t) => 0.025 + t * 0.03, uv: R.stipe, buoy: 2.6, stiff: 0.015, drag: 1.4 });
    const top = st.nodes[segs];
    p.bulbs.push({ node: top, r: 0.17, uv: R.bulb });
    for (let k = 0; k < 9; k++) {
      const a = r.range(-0.6, 0.6), L = r.range(1.6, 2.8), b0: [number, number, number] = [this.X[top], this.Y[top], this.Z[top]];
      const bp: [number, number, number][] = [b0];
      for (let q = 1; q <= 6; q++) { const t = q / 6; bp.push([b0[0] + Math.cos(a) * L * t, b0[1] + 0.1 - t * 0.4, b0[2] + Math.sin(a) * L * t * 0.4]); }
      this.chain(p, bp, { kind: 'strip', size: (t) => 0.11 * (1 - t * 0.4) + 0.02, uv: R.bull, buoy: 0.25, stiff: 0.02, drag: 3.5, side: [0, 1, 0.2], twist: r.range(-1.5, 1.5), ruffle: 0.4, tint: r.range(0.85, 1.1) }, top);
    }
    return p;
  }

  /** a clump of eelgrass / wrack straps (thin bent 3D strips) */
  addGrass(x: number, y: number, z: number, seed: number, ground: () => number, o: { n?: number; h?: [number, number]; w?: number; uv?: UVR; buoy?: number } = {}) {
    const r = new Rng(seed), p = this.plant(x, y, z, ground);
    const n = o.n ?? r.int(6, 9);
    for (let k = 0; k < n; k++) {
      const a = r.range(0, Math.PI * 2), d = r.range(0, 0.18), bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d * 0.7;
      const L = r.range(o.h?.[0] ?? 0.45, o.h?.[1] ?? 0.95), lean = r.range(-0.35, 0.35);
      const bp: [number, number, number][] = [];
      for (let q = 0; q <= 4; q++) { const t = q / 4; bp.push([bx + lean * t * t * L, y + t * L, bz + Math.sin(a) * t * 0.1]); }
      this.chain(p, bp, { kind: 'strip', size: (t) => (o.w ?? 0.06) * (1 - t * 0.45), uv: o.uv ?? this.R.grass, buoy: o.buoy ?? 0.9, stiff: 0.12, drag: 3, side: [Math.cos(a + 1.4), 0, Math.sin(a + 1.4)], twist: r.range(-1, 1), ruffle: 0.05, tint: r.range(0.8, 1.12) });
    }
    return p;
  }

  /** sea lettuce: a rosette of wide ruffled sheets */
  addLettuce(x: number, y: number, z: number, seed: number, ground: () => number) {
    const r = new Rng(seed), p = this.plant(x, y, z, ground);
    for (let k = 0; k < r.int(4, 6); k++) {
      const a = r.range(0, Math.PI * 2), L = r.range(0.28, 0.5);
      const bp: [number, number, number][] = [];
      for (let q = 0; q <= 3; q++) { const t = q / 3; bp.push([x + Math.cos(a) * t * L * 0.6, y + t * L * 0.8, z + Math.sin(a) * t * L * 0.5]); }
      this.chain(p, bp, { kind: 'strip', size: (t) => 0.32 * Math.sin(Math.min(1, t * 1.05 + 0.15) * Math.PI) + 0.03, uv: this.R.lettuce, buoy: 0.5, stiff: 0.15, drag: 3.5, side: [-Math.sin(a), 0.3, Math.cos(a)], twist: r.range(-1.4, 1.4), ruffle: 0.7, tint: r.range(0.9, 1.1) });
    }
    return p;
  }

  /** sea whips: a few stiff springy tubes */
  addWhips(x: number, y: number, z: number, seed: number, ground: () => number) {
    const r = new Rng(seed), p = this.plant(x, y, z, ground);
    for (let k = 0; k < r.int(2, 4); k++) {
      const L = r.range(0.8, 1.5), bend = r.range(-0.4, 0.4);
      const bp: [number, number, number][] = [];
      for (let q = 0; q <= 5; q++) { const t = q / 5; bp.push([x + bend * t * t + r.range(-0.03, 0.03), y + t * L, z + r.range(-0.1, 0.1)]); }
      this.chain(p, bp, { kind: 'tube', size: (t) => 0.025 * (1 - t * 0.6), uv: this.R.whip, buoy: 0.3, stiff: 0.25, drag: 2.5 });
    }
    return p;
  }

  // ------------------------------------------------------------------ interaction
  /** an explosion / shock at (x, y): blast everything outward */
  impulse(x: number, y: number, rad: number, k = 1) {
    const R2 = rad * 2.2;
    for (const p of this.plants) {
      if (!p.on || Math.abs(p.x - x) > R2 + 12) continue;
      for (const c of p.chains) for (let i = 1; i < c.nodes.length; i++) {
        const nd = c.nodes[i], dx = this.X[nd] - x, dy = this.Y[nd] - y, d = Math.hypot(dx, dy);
        if (d > R2 || d < 1e-4) continue;
        const s = (1 - d / R2) * 0.12 * k;
        this.PX[nd] -= (dx / d) * s; this.PY[nd] -= (dy / d) * s;
      }
    }
  }

  /** cut everything a blade swept through from (ax, ay) to (bx, by); returns how many strands were cut */
  cut(ax: number, ay: number, bx: number, by: number): number {
    let cuts = 0;
    const minX = Math.min(ax, bx) - 0.3, maxX = Math.max(ax, bx) + 0.3;
    for (const p of this.plants) {
      if (!p.on || p.x < minX - 3 || p.x > maxX + 3) continue;
      for (const c of [...p.chains]) {
        if (c.dead || c.free) continue;
        for (let i = 1; i < c.nodes.length; i++) {
          const a = c.nodes[i - 1], b = c.nodes[i];
          if (Math.abs(this.Z[b]) > 1.4) continue;
          if (!segHit(ax, ay, bx, by, this.X[a], this.Y[a], this.X[b], this.Y[b])) continue;
          // split: the upper part drifts away (with anything attached to it)
          const rest = c.nodes.splice(i);
          const dir = c.dir.splice(i - 1);
          const piece: Chain = { ...c, nodes: rest, dir: dir.slice(1).length ? dir.slice(1) : dir, anchor: null, parent: -1, free: true, age: 0, dead: false };
          if (rest.length >= 2) {
            p.chains.push(piece);
            for (const o of p.chains) if (o !== piece && o !== c && !o.anchor && rest.includes(o.nodes[0])) o.host = piece;
          }
          cuts++;
          this.onCut?.(this.X[b], this.Y[b]);
          // a little kick so the piece tumbles
          for (const nd of rest) { this.PX[nd] -= (bx - ax) * 0.02; this.PY[nd] -= (by - ay) * 0.02 + 0.01; }
          break;
        }
      }
    }
    return cuts;
  }

  // ------------------------------------------------------------------ simulation
  update(dt: number, w: World, camX: number) {
    dt = Math.min(dt, 1 / 30);
    this.t += dt;
    const t = this.t;
    // pushers: the player and every creature / human / projectile near the camera
    const pushers: { x: number; y: number; vx: number; vy: number; r: number; cutter: boolean; ox: number; oy: number }[] = [];
    const consider = (e: Entity) => {
      if (!e.alive || Math.abs(e.x - camX) > this.window + 2) return;
      const prev = this.prevE.get(e) ?? [e.x, e.y];
      const vx = (e.x - prev[0]) / Math.max(dt, 1e-4), vy = (e.y - prev[1]) / Math.max(dt, 1e-4);
      this.prevE.set(e, [e.x, e.y]);
      const cutter = /harpoon|spear|bolt|projectile|shot|torpedo/i.test(e.kind) && Math.hypot(vx, vy) > 5;
      pushers.push({ x: e.x, y: e.y, vx, vy, r: Math.max(0.25, Math.min(1.6, e.r)), cutter, ox: prev[0], oy: prev[1] });
    };
    consider(w.player);
    for (const e of w.entities) if (e.obj && e.kind !== 'resource' && e.kind !== 'shipwreck' && e.kind !== 'mailbuoy' && e.kind !== 'plants') consider(e);
    for (const q of pushers) if (q.cutter) this.cut(q.ox, q.oy, q.x, q.y);
    if (this.prevE.size > 200) this.prevE.clear();
    const gust = this.current * (0.65 + 0.35 * Math.sin(t * 0.31) + 0.2 * Math.sin(t * 1.13));
    const k2 = dt * dt;
    let v = 0;
    for (const p of this.plants) {
      const on = Math.abs(p.x - camX) < this.window;
      if (!on) { p.on = false; continue; }
      p.on = true;
      // ride the sand: the holdfast follows the floor
      const gy = p.ground();
      for (const c of p.chains) {
        if (c.dead) continue;
        if (c.host?.dead) { c.dead = true; continue; }
        if (c.free) {
          c.age += dt;
          if (c.age > 14) { c.dead = true; p.deadNodes ??= new Set(); for (const nd of c.nodes) p.deadNodes.add(nd); continue; }
        }
        const N = c.nodes.length;
        // integrate
        for (let i = 0; i < N; i++) {
          const nd = c.nodes[i];
          if (i === 0 && !c.free) continue;
          const vx = (this.X[nd] - this.PX[nd]), vy = (this.Y[nd] - this.PY[nd]), vz = (this.Z[nd] - this.PZ[nd]);
          const dmp = Math.exp(-c.drag * dt);
          const hy = (this.Y[nd] - gy) * 0.3;
          const cur = gust * (0.6 + Math.min(1, hy * 0.25)) + Math.sin(t * 0.9 + this.X[nd] * 0.35 + this.Y[nd] * 0.2) * 0.12;
          const ax = (cur - vx / dt) * 0.8;
          const ay = c.buoy * (c.free ? 0.6 : 1) - (this.Y[nd] > -0.4 ? 6 : 0);
          this.PX[nd] = this.X[nd]; this.PY[nd] = this.Y[nd]; this.PZ[nd] = this.Z[nd];
          this.X[nd] += vx * dmp + ax * k2; this.Y[nd] += vy * dmp + ay * k2; this.Z[nd] += vz * dmp * 0.9 - this.Z[nd] * 0.0 * k2;
        }
        // pushers part the plants and leave a wake
        for (const q of pushers) {
          if (Math.abs(q.x - p.x) > 4) continue;
          const rr = q.r + 0.22;
          for (let i = 1; i < N; i++) {
            const nd = c.nodes[i];
            if (Math.abs(this.Z[nd]) > 1.6) continue;
            const dx = this.X[nd] - q.x, dy = this.Y[nd] - q.y, d = Math.hypot(dx, dy);
            if (d < rr && d > 1e-4) { this.X[nd] = q.x + (dx / d) * rr; this.Y[nd] = q.y + (dy / d) * rr; }
            if (d < rr * 2.6) { const wk = (1 - d / (rr * 2.6)) * 0.35 * dt; this.PX[nd] -= q.vx * wk; this.PY[nd] -= q.vy * wk; }
          }
        }
        // constraints: pinned root, follow-the-leader lengths, bending toward the grown shape
        for (let it = 0; it < 2; it++) {
          if (!c.free) {
            const r0 = c.nodes[0];
            if (c.anchor) { this.X[r0] = c.anchor[0]; this.Y[r0] = c.anchor[1] + (gy - p.baseY); this.Z[r0] = c.anchor[2]; }
          }
          for (let i = 1; i < N; i++) {
            const a = c.nodes[i - 1], b = c.nodes[i];
            let dx = this.X[b] - this.X[a], dy = this.Y[b] - this.Y[a], dz = this.Z[b] - this.Z[a];
            const dir = c.dir[Math.min(c.dir.length - 1, i - 1)];
            if (dir && c.stiff > 0) { const s = c.stiff; dx += (dir[0] * c.rest - dx) * s; dy += (dir[1] * c.rest - dy) * s; dz += (dir[2] * c.rest - dz) * s; }
            const l = Math.hypot(dx, dy, dz) || 1e-6, k = c.rest / l;
            this.X[b] = this.X[a] + dx * k; this.Y[b] = this.Y[a] + dy * k; this.Z[b] = this.Z[a] + dz * k;
            // keep out of the seabed
            const fl = p.ground() + 0.02;
            if (this.Y[b] < fl && Math.abs(this.Z[b]) < 3) this.Y[b] = fl;
          }
        }
        v = this.skinChain(c, v);
      }
      for (const b of p.bulbs) if (!p.deadNodes?.has(b.node)) v = this.skinBall(b, v);
    }
    this.geo.setDrawRange(0, v);
    for (const k of ['position', 'uv', 'color'] as const) { const at = this.geo.attributes[k] as THREE.BufferAttribute; at.needsUpdate = true; at.clearUpdateRanges(); at.addUpdateRange(0, v * (k === 'uv' ? 2 : 3)); }
  }

  // ------------------------------------------------------------------ skinning
  private tri(v: number, a: number[], b: number[], c: number[], ua: number[], ub: number[], uc: number[], k: number[]) {
    if (v + 3 > MAXV) return v;
    const P = this.pos, U = this.uv, C = this.col;
    P.set(a, v * 3); P.set(b, v * 3 + 3); P.set(c, v * 3 + 6);
    U[v * 2] = ua[0]; U[v * 2 + 1] = ua[1]; U[v * 2 + 2] = ub[0]; U[v * 2 + 3] = ub[1]; U[v * 2 + 4] = uc[0]; U[v * 2 + 5] = uc[1];
    C[v * 3] = C[v * 3 + 1] = C[v * 3 + 2] = k[0]; C[v * 3 + 3] = C[v * 3 + 4] = C[v * 3 + 5] = k[1]; C[v * 3 + 6] = C[v * 3 + 7] = C[v * 3 + 8] = k[2];
    return v + 3;
  }

  private skinChain(c: Chain, v: number) {
    const N = c.nodes.length, X = this.X, Y = this.Y, Z = this.Z, U = c.uv;
    const host = c.free ? c : c.host;
    const fade = host ? Math.max(0, 1 - Math.max(0, host.age - 9) / 5) : 1;
    if (fade <= 0) return v;
    const frames: { p: number[]; t: number[] }[] = [];
    for (let i = 0; i < N; i++) {
      const a = c.nodes[Math.max(0, i - 1)], b = c.nodes[Math.min(N - 1, i + 1)];
      let tx = X[b] - X[a], ty = Y[b] - Y[a], tz = Z[b] - Z[a]; const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
      frames.push({ p: [X[c.nodes[i]], Y[c.nodes[i]], Z[c.nodes[i]]], t: [tx, ty, tz] });
    }
    const tint = c.tint;
    if (c.kind === 'tube') {
      const S = 5;
      let prev: number[][] | null = null;
      for (let i = 0; i < N; i++) {
        const { p, t } = frames[i];
        let sx = t[1] * 1 - t[2] * 0, sy = t[2] * 0 - t[0] * 1, sz = 0; // side = t x z-axis
        let sl = Math.hypot(sx, sy, sz); if (sl < 1e-3) { sx = 1; sy = 0; sz = 0; sl = 1; }
        sx /= sl; sy /= sl; sz /= sl;
        const ux = t[1] * sz - t[2] * sy, uy = t[2] * sx - t[0] * sz, uz = t[0] * sy - t[1] * sx;
        const rad = c.size(i / (N - 1)) * fade;
        const ring: number[][] = [];
        for (let k = 0; k < S; k++) { const an = (k / S) * Math.PI * 2, co = Math.cos(an) * rad, si = Math.sin(an) * rad; ring.push([p[0] + sx * co + ux * si, p[1] + sy * co + uy * si, p[2] + sz * co + uz * si]); }
        if (prev) {
          const v0 = U.v0 + (U.v1 - U.v0) * ((i - 1) / (N - 1)), v1 = U.v0 + (U.v1 - U.v0) * (i / (N - 1));
          for (let k = 0; k < S; k++) {
            const k2 = (k + 1) % S, u0 = U.u0 + (U.u1 - U.u0) * (k / S), u1 = U.u0 + (U.u1 - U.u0) * ((k + 1) / S);
            const sh = (0.75 + 0.25 * Math.cos((k / S) * Math.PI * 2)) * tint;
            v = this.tri(v, prev[k], ring[k], ring[k2], [u0, v0], [u0, v1], [u1, v1], [sh, sh, sh]);
            v = this.tri(v, prev[k], ring[k2], prev[k2], [u0, v0], [u1, v1], [u1, v0], [sh, sh, sh]);
          }
        }
        prev = ring;
      }
      return v;
    }
    // strip: left / raised midrib / right, twisted, ruffled
    let prev: number[][] | null = null;
    for (let i = 0; i < N; i++) {
      const { p, t } = frames[i], tt = i / (N - 1);
      // side axis: the chain's own side, made perpendicular to the tangent, twisted along the blade
      let sx = c.side[0], sy = c.side[1], sz = c.side[2];
      const dd = sx * t[0] + sy * t[1] + sz * t[2]; sx -= t[0] * dd; sy -= t[1] * dd; sz -= t[2] * dd;
      let sl = Math.hypot(sx, sy, sz) || 1; sx /= sl; sy /= sl; sz /= sl;
      let nx = t[1] * sz - t[2] * sy, ny = t[2] * sx - t[0] * sz, nz = t[0] * sy - t[1] * sx;
      const tw = c.twist * tt + Math.sin(this.t * 3 + i + c.nodes[0]) * 0.15 * tt;
      const ct = Math.cos(tw), st = Math.sin(tw);
      const ax = sx * ct + nx * st, ay = sy * ct + ny * st, az = sz * ct + nz * st;
      nx = nx * ct - sx * st; ny = ny * ct - sy * st; nz = nz * ct - sz * st;
      sx = ax; sy = ay; sz = az; sl = 1;
      const wdt = c.size(tt) * 0.5 * fade, rf = Math.sin(i * 2.3 + c.nodes[0]) * c.ruffle * wdt, rib = wdt * 0.25;
      const L = [p[0] - sx * wdt + nx * rf, p[1] - sy * wdt + ny * rf, p[2] - sz * wdt + nz * rf];
      const M = [p[0] + nx * rib, p[1] + ny * rib, p[2] + nz * rib];
      const Rr = [p[0] + sx * wdt - nx * rf, p[1] + sy * wdt - ny * rf, p[2] + sz * wdt - nz * rf];
      const row = [L, M, Rr];
      if (prev) {
        const v0 = U.v0 + (U.v1 - U.v0) * ((i - 1) / (N - 1)), v1 = U.v0 + (U.v1 - U.v0) * tt, um = (U.u0 + U.u1) / 2;
        const k0 = (0.82 + 0.18 * tt) * tint;
        v = this.tri(v, prev[0], row[0], row[1], [U.u0, v0], [U.u0, v1], [um, v1], [k0 * 0.92, k0 * 0.92, k0]);
        v = this.tri(v, prev[0], row[1], prev[1], [U.u0, v0], [um, v1], [um, v0], [k0 * 0.92, k0, k0]);
        v = this.tri(v, prev[1], row[1], row[2], [um, v0], [um, v1], [U.u1, v1], [k0, k0, k0 * 1.05]);
        v = this.tri(v, prev[1], row[2], prev[2], [um, v0], [U.u1, v1], [U.u1, v0], [k0, k0 * 1.05, k0 * 1.05]);
      }
      prev = row;
    }
    return v;
  }

  /** a faceted gas bladder (octahedron) at a node */
  private skinBall(b: Bulb, v: number) {
    const x = this.X[b.node], y = this.Y[b.node], z = this.Z[b.node], r = b.r, U = b.uv;
    const P = [[x + r, y, z], [x, y + r * 1.2, z], [x - r, y, z], [x, y - r * 1.1, z], [x, y, z + r], [x, y, z - r]];
    const F = [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4], [1, 0, 5], [2, 1, 5], [3, 2, 5], [0, 3, 5]];
    const um = (U.u0 + U.u1) / 2, vm = (U.v0 + U.v1) / 2;
    for (const [a, bb, c] of F) v = this.tri(v, P[a], P[bb], P[c], [U.u0, U.v0], [U.u1, vm], [um, U.v1], [1.05, 1, 0.9]);
    return v;
  }

  dispose() { this.geo.dispose(); }
}

function segHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax), d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx), d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
