// Diorama layout for an act map: the current curves between nodes, where each fishing-spot vignette sits,
// the islands / rocks / reef shelves around them, and the ground heightfield G(x, z) (seabed below 0, land
// above) baked onto a grid. The water shader, the ground mesh and the cutaway face all read the same grid,
// so the cross-section always matches the terrain exactly.
import { Rng } from '../core/rng';
import { clamp, clamp01, fbm, lerp, segDist, smooth, vnoise } from '../core/math';
import type { ActMap, MapNode, ZoneId } from './gen';

export type IslandKind = 'tropical' | 'rocky' | 'sandbar' | 'dune' | 'harbor' | 'snow' | 'ice' | 'volcanic';
export interface Blob { x: number; z: number; rx: number; rz: number; c: number; s: number }
export interface Island { x: number; z: number; r: number; h: number; kind: IslandKind; blobs: Blob[]; seed: number; zone: number; shelf: number; tag?: string }
export interface Rock { x: number; z: number; s: number; rot: number; h: number; seed: number; zone: number }
export interface Shelf { x: number; z: number; r: number; depth: number }
export type VKind = 'pier' | 'rowboat' | 'canoeKelp' | 'harborDock' | 'reefDinghy' | 'iceHole' | 'trawler' | 'beach' | 'tournament'
  | 'crabShop' | 'turtleSpa' | 'cleaner' | 'wreck' | 'mystery' | 'boss' | 'startDock';
export interface Vignette { node: MapNode | null; kind: VKind; x: number; z: number; ang: number; r: number; island?: Island; seed: number }

export interface Curve { a: number; b: number; key: string; pts: [number, number][]; cum: number[]; len: number }

export const SLAB = { bevel: 0.45, cornerR: 3.2 };
export const ZONE_DEPTH: Record<ZoneId, number> = { reef: -1.45, kelp: -2.35, sunset: -1.75, harbor: -2.0, arctic: -2.5, abyss: -3.2, trench: -4.0 };
const KINDS: Record<ZoneId, [IslandKind, number][]> = {
  reef: [['tropical', 6], ['sandbar', 2], ['rocky', 1.5]],
  kelp: [['rocky', 5], ['tropical', 3.5], ['sandbar', 1.5]],
  sunset: [['tropical', 5], ['dune', 3], ['rocky', 2]],
  harbor: [['harbor', 6], ['rocky', 4]],
  arctic: [['snow', 5], ['ice', 3], ['rocky', 2]],
  abyss: [['volcanic', 7], ['rocky', 3]],
  trench: [['volcanic', 8], ['rocky', 2]],
};

const VEG: Record<IslandKind, number> = { tropical: 1, harbor: 0.85, dune: 0.3, sandbar: 0, rocky: 0.55, snow: 1, ice: 1, volcanic: 0.4 };
const ROCKY: Record<IslandKind, number> = { tropical: 0.04, harbor: 0.25, dune: 0, sandbar: 0, rocky: 0.75, snow: 0.4, ice: 0, volcanic: 0.8 };

export class Layout {
  map: ActMap;
  W: number; zFront: number; zBack: number; depth: number;
  curves = new Map<string, Curve>();
  islands: Island[] = [];
  rocks: Rock[] = [];
  shelves: Shelf[] = [];
  vignettes: Vignette[] = [];
  dock: { x: number; z: number };
  zoneIds: ZoneId[];
  // baked grid
  step = 0.125;
  nx = 0; nz = 0; x0 = 0; z0 = 0;
  g!: Float32Array;
  shore!: Float32Array;
  /** per cell: vegetation + rockiness of the island the cell belongs to (0..1) */
  veg!: Float32Array;
  rocky!: Float32Array;
  private lastIsl = -1;
  private rng: Rng;
  private avoid: { x: number; z: number; r: number }[] = [];

  constructor(map: ActMap) {
    this.map = map;
    this.rng = new Rng(map.seed ^ 0x51ed27);
    this.W = Math.ceil(map.width);
    this.zFront = map.zFront;
    this.zBack = map.zBack;
    this.zoneIds = map.zones.map((z) => z.id);
    this.depth = map.act === 3 ? 7.4 : map.act === 2 ? 6.6 : 6.0;
    const start = map.nodes[map.startId];
    this.dock = { x: start.x, z: start.z + 2.5 };
    this.buildCurves();
    this.planVignettes();
    this.placeIslands();
    this.placeRocks();
    this.bake();
  }

  // ------------------------------------------------------------------ zones
  /** blend weights of the (up to 3) zones at z */
  zoneW(z: number): [number, number, number] {
    const zz = this.map.zoneZ, w = 2.2;
    const t1 = zz.length > 0 ? smooth(zz[0] + w, zz[0] - w, z) : 0;
    const t2 = zz.length > 1 ? smooth(zz[1] + w, zz[1] - w, z) : 0;
    return [1 - t1, t1 - t2, t2];
  }
  zoneAt(z: number): number { const w = this.zoneW(z); return w[2] > 0.5 ? 2 : w[1] > 0.5 ? 1 : 0; }
  zoneId(z: number): ZoneId { return this.zoneIds[Math.min(this.zoneIds.length - 1, this.zoneAt(z))]; }

  // ------------------------------------------------------------------ outline
  /** signed distance inside the slab outline (positive inside); the front edge (z = zFront) is square */
  sd(x: number, z: number): number {
    const hw = this.W / 2, R = SLAB.cornerR;
    const cz = this.zBack + R, cx = hw - R;
    if (z < cz && Math.abs(x) > cx) return R - Math.hypot(Math.abs(x) - cx, z - cz);
    return Math.min(hw - Math.abs(x), z - this.zBack, this.zFront - z + 50);
  }
  /** pull a point outside the outline back onto it */
  clampIn(x: number, z: number): [number, number] {
    const hw = this.W / 2, R = SLAB.cornerR;
    const cz = this.zBack + R, cx = hw - R;
    x = clamp(x, -hw, hw); z = clamp(z, this.zBack, this.zFront);
    if (z < cz && Math.abs(x) > cx) {
      const dx = Math.abs(x) - cx, dz = z - cz, d = Math.hypot(dx, dz);
      if (d > R) { const k = R / d; x = Math.sign(x) * (cx + dx * k); z = cz + dz * k; }
    }
    return [x, z];
  }

  // ------------------------------------------------------------------ currents
  private buildCurves() {
    const m = this.map;
    const mk = (a: number, b: number, ax: number, az: number, bx: number, bz: number, key: string) => {
      const r = new Rng((m.seed ^ Math.imul(a + 7, 7919) ^ Math.imul(b + 3, 104729)) >>> 0);
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
      const px = -dz / l, pz = dx / l;
      const bend = r.range(-0.45, 0.45) * Math.min(1, l / 3);
      const cx = (ax + bx) / 2 + px * bend, cz = (az + bz) / 2 + pz * bend;
      const pts: [number, number][] = [];
      const N = Math.max(16, Math.round(l * 7));
      for (let i = 0; i <= N; i++) {
        const t = i / N, u = 1 - t;
        // a gentle S-wiggle on top of the bend makes the currents read as flowing water
        const wig = Math.sin(t * Math.PI * 2) * Math.sin(t * Math.PI) * 0.12 * r.sign();
        pts.push([u * u * ax + 2 * u * t * cx + t * t * bx + px * wig, u * u * az + 2 * u * t * cz + t * t * bz + pz * wig]);
      }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      this.curves.set(key, { a, b, key, pts, cum, len: cum[cum.length - 1] });
    };
    for (const n of m.nodes) for (const id of n.next) { const b = m.nodes[id]; mk(n.id, id, n.x, n.z, b.x, b.z, n.id + '>' + id); }
    const s = m.nodes[m.startId];
    mk(-1, s.id, this.dock.x, this.dock.z, s.x, s.z, 'dock>' + s.id);
  }
  curve(a: number, b: number): Curve | undefined { return this.curves.get((a < 0 ? 'dock' : a) + '>' + b); }
  /** point + tangent at distance s along a curve */
  along(c: Curve, s: number): { x: number; z: number; tx: number; tz: number } {
    s = clamp(s, 0, c.len);
    let i = 1;
    while (i < c.cum.length - 1 && c.cum[i] < s) i++;
    const s0 = c.cum[i - 1], s1 = c.cum[i], t = (s - s0) / (s1 - s0 || 1);
    const [ax, az] = c.pts[i - 1], [bx, bz] = c.pts[i];
    const l = Math.hypot(bx - ax, bz - az) || 1;
    return { x: lerp(ax, bx, t), z: lerp(az, bz, t), tx: (bx - ax) / l, tz: (bz - az) / l };
  }

  /** free space around (x, z): distance to the nearest current / node / reserved footprint */
  clearance(x: number, z: number, nodePad = 1.05, curvePad = 0.5): number {
    let d = 1e9;
    for (const n of this.map.nodes) d = Math.min(d, Math.hypot(x - n.x, z - n.z) - nodePad);
    d = Math.min(d, Math.hypot(x - this.dock.x, z - this.dock.z) - 0.9);
    for (const c of this.curves.values()) {
      const [ax, az] = c.pts[0], [bx, bz] = c.pts[c.pts.length - 1];
      // cheap reject on the chord's bounding box
      if (x < Math.min(ax, bx) - d - 1 || x > Math.max(ax, bx) + d + 1 || z < Math.min(az, bz) - d - 1 || z > Math.max(az, bz) + d + 1) continue;
      for (let i = 1; i < c.pts.length; i++) d = Math.min(d, segDist(x, z, c.pts[i - 1][0], c.pts[i - 1][1], c.pts[i][0], c.pts[i][1]).d - curvePad);
    }
    for (const a of this.avoid) d = Math.min(d, Math.hypot(x - a.x, z - a.z) - a.r);
    return d;
  }
  private reserve(x: number, z: number, r: number) { this.avoid.push({ x, z, r }); }

  // ------------------------------------------------------------------ vignettes (the detailed fishing spots)
  private bestSpot(n: MapNode, dist: number, need: number): { x: number; z: number; ang: number; score: number } {
    let best = { x: n.x + dist, z: n.z, ang: 0, score: -1e9 };
    const r = new Rng(n.seed);
    const off = r.next() * Math.PI * 2;
    for (let i = 0; i < 20; i++) {
      const ang = off + (i / 20) * Math.PI * 2;
      const x = n.x + Math.cos(ang) * dist, z = n.z + Math.sin(ang) * dist;
      if (this.sd(x, z) < need + 0.7) continue;
      const cl = this.clearance(x, z, 0.4, 0.35);
      // in front of the marker (toward the camera, +z) would hide it; sideways reads best
      const facing = Math.sin(ang) > 0.55 ? -0.6 : 0;
      const score = Math.min(cl, need + 0.6) + Math.abs(Math.cos(ang)) * 0.25 + facing - (cl < need ? 3 + (need - cl) * 4 : 0);
      if (score > best.score) best = { x, z, ang, score };
    }
    return best;
  }

  private planVignettes() {
    const m = this.map;
    const rng = this.rng;
    const add = (v: Vignette) => { this.vignettes.push(v); this.reserve(v.x, v.z, v.r); };
    for (const n of m.nodes) {
      const zone = n.zone;
      let kind: VKind;
      if (n.type === 'boss') kind = 'boss';
      else if (n.type === 'elite') kind = 'tournament';
      else if (n.type === 'shop') kind = 'crabShop';
      else if (n.type === 'rest') kind = n.title === 'Cleaner Station' ? 'cleaner' : 'turtleSpa';
      else if (n.type === 'treasure') kind = 'wreck';
      else if (n.type === 'mystery') kind = 'mystery';
      else kind = ({ pier: 'pier', rowboatCove: 'rowboat', kelpForest: 'canoeKelp', harbor: 'harborDock', reef: 'reefDinghy', iceHole: 'iceHole', trawlerLane: 'trawler', sunsetBay: 'beach' } as const)[n.spot];
      if (kind === 'mystery') { this.vignettes.push({ node: n, kind, x: n.x, z: n.z, ang: 0, r: 0, seed: n.seed }); continue; }
      if (kind === 'boss') {
        const v: Vignette = { node: n, kind, x: n.x + 0.4, z: n.z - 3.4, ang: -Math.PI / 2, r: 2.4, seed: n.seed };
        add(v);
        continue;
      }
      // spots that bring their own island
      if (kind === 'pier' || kind === 'beach' || kind === 'crabShop' || kind === 'iceHole' || kind === 'harborDock') {
        const isl = kind === 'pier' ? { d: 2.7, r: 1.25, kind: zone === 'arctic' ? 'snow' : zone === 'harbor' || zone === 'abyss' || zone === 'trench' ? 'rocky' : 'tropical' }
          : kind === 'beach' ? { d: 1.85, r: 0.95, kind: 'dune' }
          : kind === 'crabShop' ? { d: 1.55, r: 0.72, kind: 'sandbar' }
          : kind === 'iceHole' ? { d: 1.55, r: 0.85, kind: 'ice' }
          : { d: 2.9, r: 1.35, kind: zone === 'arctic' ? 'snow' : 'harbor' };
        const sp = this.bestSpot(n, isl.d, isl.r);
        let r = isl.r;
        const cl = this.clearance(sp.x, sp.z, 0.45, 0.4);
        if (cl < r) r = Math.max(0.5, cl);
        if (cl > 0.45) {
          const island = this.makeIsland(sp.x, sp.z, r, isl.kind as IslandKind, n.seed, kind);
          this.islands.push(island);
          add({ node: n, kind, x: sp.x, z: sp.z, ang: sp.ang, r: r + 0.25, island, seed: n.seed });
          // the pier / dock deck itself
          if (kind === 'pier' || kind === 'harborDock') for (let k = 0.3; k < 0.95; k += 0.2) this.reserve(lerp(n.x, sp.x, k), lerp(n.z, sp.z, k), 0.25);
          continue;
        }
        kind = 'rowboat';
      }
      const dist = kind === 'trawler' ? 1.75 : kind === 'tournament' ? 0 : kind === 'wreck' ? 1.25 : 1.2;
      if (kind === 'tournament') { this.vignettes.push({ node: n, kind, x: n.x, z: n.z, ang: rng.next() * 6.28, r: 1.6, seed: n.seed }); continue; }
      const need = kind === 'trawler' ? 0.85 : 0.5;
      const sp = this.bestSpot(n, dist, need);
      add({ node: n, kind, x: sp.x, z: sp.z, ang: sp.ang, r: need, seed: n.seed });
      if (kind === 'reefDinghy') this.shelves.push({ x: n.x, z: n.z, r: 2.4, depth: 0.55 });
      if (kind === 'wreck') this.shelves.push({ x: sp.x, z: sp.z, r: 2.2, depth: 1.25 });
      if (kind === 'turtleSpa' || kind === 'cleaner') this.shelves.push({ x: sp.x, z: sp.z, r: 1.6, depth: 0.7 });
    }
    // the home dock in front of the start node
    this.vignettes.push({ node: null, kind: 'startDock', x: this.dock.x, z: this.dock.z + 0.6, ang: Math.PI / 2, r: 0.8, seed: this.map.seed });
    this.reserve(this.dock.x, this.dock.z + 0.8, 1.0);
    // a sunken wreck near the front edge so the cutaway always has one in cross-section
    const wx = (rng.chance(0.5) ? -1 : 1) * rng.range(2.5, this.W / 2 - 3), wz = this.zFront - rng.range(2.0, 3.2);
    if (this.clearance(wx, wz, 0.3, 0.2) > 0.3) {
      this.vignettes.push({ node: null, kind: 'wreck', x: wx, z: wz, ang: rng.range(-0.4, 0.4), r: 0, seed: this.map.seed + 5 });
      this.shelves.push({ x: wx, z: wz, r: 1.8, depth: 1.9 });
    }
  }

  makeIsland(x: number, z: number, r: number, kind: IslandKind, seed: number, tag?: string): Island {
    const rr = new Rng(seed ^ 0x9e37);
    const blobs: Blob[] = [];
    const nb = kind === 'ice' || kind === 'sandbar' ? 1 : rr.int(1, 3);
    for (let i = 0; i < nb; i++) {
      const a = rr.range(0, Math.PI * 2), o = i === 0 ? 0 : r * rr.range(0.35, 0.6);
      const br = i === 0 ? r : r * rr.range(0.45, 0.7);
      const rot = rr.range(0, Math.PI);
      blobs.push({ x: x + Math.cos(a) * o, z: z + Math.sin(a) * o, rx: br * rr.range(0.95, 1.15), rz: br * rr.range(0.62, 0.95), c: Math.cos(rot), s: Math.sin(rot) });
    }
    const sz = Math.sqrt(r / 1.5);
    const h = kind === 'tropical' ? rr.range(0.45, 0.9) * sz : kind === 'rocky' ? rr.range(0.7, 1.35) * sz : kind === 'sandbar' ? rr.range(0.07, 0.12)
      : kind === 'dune' ? rr.range(0.3, 0.5) * sz : kind === 'harbor' ? rr.range(0.45, 0.85) * sz : kind === 'snow' ? rr.range(0.45, 1.0) * sz
      : kind === 'ice' ? rr.range(0.1, 0.14) : rr.range(0.8, 1.55) * sz;
    const shelf = kind === 'tropical' || kind === 'sandbar' || kind === 'dune' ? 1.25 : kind === 'ice' ? 0.25 : kind === 'volcanic' ? 0.6 : 0.55;
    return { x, z, r, h, kind, blobs, seed, zone: this.zoneAt(z), shelf, tag };
  }

  private placeIslands() {
    const rng = this.rng;
    const hw = this.W / 2;
    const kindAt = (z: number) => rng.weighted(KINDS[this.zoneId(z)], (k) => k[1])[0];
    const tryIsland = (x: number, z: number, r: number, minR: number, gap: number) => {
      const cl = Math.min(this.clearance(x, z, 1.15, 0.62), this.sd(x, z) - 0.75);
      let d = cl;
      for (const i of this.islands) d = Math.min(d, Math.hypot(x - i.x, z - i.z) - i.r * 1.05 - gap);
      if (d < minR) return false;
      const rr = Math.min(r, d);
      const isl = this.makeIsland(x, z, rr, kindAt(z), rng.int(0, 1 << 30));
      this.islands.push(isl);
      return true;
    };
    // big islands along both side margins
    for (const side of [-1, 1]) {
      let z = this.zFront - rng.range(1.5, 3.5);
      while (z > this.zBack + 2) {
        const r = rng.range(1.3, 2.5);
        const x = side * (hw - r - rng.range(0.7, 1.4));
        if (!tryIsland(x, z, r, 0.8, 0.5)) tryIsland(x + side * 0.6, z, r * 0.7, 0.6, 0.4);
        z -= rng.range(4.5, 7.5);
      }
    }
    // small islands in the gaps between the currents
    const cands: [number, number][] = [];
    for (let z = this.zFront - 1.5; z > this.zBack + 1.5; z -= 0.85) for (let x = -hw + 1.2; x < hw - 1.2; x += 0.85) cands.push([x + rng.range(-0.3, 0.3), z + rng.range(-0.3, 0.3)]);
    rng.shuffle(cands);
    const maxN = Math.round((this.zFront - this.zBack) / 3.2);
    let placed = 0;
    for (const [x, z] of cands) {
      if (placed >= maxN) break;
      if (tryIsland(x, z, rng.range(0.6, 1.5), 0.58, 0.7)) placed++;
    }
  }

  private placeRocks() {
    const rng = this.rng;
    const hw = this.W / 2;
    // rocks hugging island coasts, and a few lone sea stacks
    for (const isl of this.islands) {
      if (isl.kind === 'ice' || isl.kind === 'sandbar') continue;
      const n = rng.int(1, isl.kind === 'rocky' || isl.kind === 'volcanic' ? 5 : 3);
      for (let i = 0; i < n; i++) {
        const a = rng.range(0, Math.PI * 2), d = isl.r * rng.range(0.95, 1.35);
        const x = isl.x + Math.cos(a) * d, z = isl.z + Math.sin(a) * d;
        if (this.clearance(x, z, 0.8, 0.42) < 0.2 || this.sd(x, z) < 0.6) continue;
        this.rocks.push({ x, z, s: rng.range(0.16, 0.38), rot: rng.range(0, 6.28), h: rng.range(0.05, 0.3), seed: rng.int(0, 1 << 30), zone: this.zoneAt(z) });
      }
    }
    for (let i = 0; i < 60 && this.rocks.length < 140; i++) {
      const x = rng.range(-hw + 1, hw - 1), z = rng.range(this.zBack + 2, this.zFront - 1);
      const cl = this.clearance(x, z, 1.0, 0.6);
      if (cl < 0.4 || this.sd(x, z) < 0.8) continue;
      let ok = true;
      for (const isl of this.islands) if (Math.hypot(x - isl.x, z - isl.z) < isl.r + 0.6) ok = false;
      if (!ok) continue;
      const cnt = rng.int(1, 3);
      for (let k = 0; k < cnt; k++) this.rocks.push({ x: x + rng.range(-0.3, 0.3), z: z + rng.range(-0.3, 0.3), s: rng.range(0.14, 0.34) * (k ? 0.7 : 1), rot: rng.range(0, 6.28), h: rng.range(0.04, 0.32), seed: rng.int(0, 1 << 30), zone: this.zoneAt(z) });
    }
  }

  // ------------------------------------------------------------------ heightfield
  /** normalised island distance (1 at the coast) */
  islandD(isl: Island, x: number, z: number): number {
    let d = 1e9;
    for (const b of isl.blobs) {
      const dx = x - b.x, dz = z - b.z;
      const u = (dx * b.c + dz * b.s) / b.rx, v = (-dx * b.s + dz * b.c) / b.rz;
      d = Math.min(d, Math.sqrt(u * u + v * v));
    }
    const wob = isl.kind === 'ice' ? 0.06 : isl.kind === 'sandbar' ? 0.1 : 0.2;
    return d * (1 + wob * (vnoise(x * 1.7 + isl.seed % 97, z * 1.7) - 0.5) + 0.07 * (vnoise(x * 4.3, z * 4.3 + isl.seed % 31) - 0.5));
  }
  islandH(isl: Island, d: number, x: number, z: number): number {
    const h = isl.h;
    if (d < 1) {
      switch (isl.kind) {
        case 'tropical': case 'harbor': case 'dune': {
          const k = smooth(0.97, isl.kind === 'dune' ? 0.15 : 0.32, d);
          const bump = (fbm(x * 1.1 + isl.seed % 13, z * 1.1, 3) - 0.45) * h * 0.55 * smooth(0.95, 0.45, d);
          return 0.03 + h * Math.pow(k, 1.15) + bump;
        }
        case 'rocky': case 'snow': {
          const k = smooth(1.0, 0.5, d);
          const ridge = (1 - Math.abs(fbm(x * 0.9 + isl.seed % 7, z * 0.9, 3) * 2 - 1)) * h * 0.4 * k;
          return 0.03 + h * Math.pow(k, 0.75) + ridge;
        }
        case 'sandbar': return 0.02 + h * smooth(1.0, 0.2, d);
        case 'ice': return 0.02 + h * smooth(1.0, 0.9, d) + (vnoise(x * 3, z * 3) - 0.5) * 0.02;
        case 'volcanic': {
          const cone = Math.pow(clamp01(1 - d), 1.1) * h;
          const crater = smooth(0.32, 0.05, d) * h * 0.38;
          return 0.03 + cone - crater + (fbm(x * 1.5, z * 1.5 + isl.seed % 11, 3) - 0.5) * h * 0.3 * (1 - d);
        }
      }
    }
    return -0.05 - 3.5 * smooth(1.0, 1.0 + isl.shelf, d);
  }
  baseDepth(x: number, z: number): number {
    const w = this.zoneW(z);
    let b = 0;
    for (let i = 0; i < 3; i++) if (w[i] > 0) b += w[i] * ZONE_DEPTH[this.zoneIds[Math.min(i, this.zoneIds.length - 1)]];
    b += (fbm(x * 0.16 + 3.1, z * 0.16, 4) - 0.5) * 1.1 + (vnoise(x * 0.75, z * 0.75 + 9.3) - 0.5) * 0.3;
    // deep trenches in the abyss
    if (this.map.act === 3) b -= Math.pow(clamp01(1 - Math.abs(fbm(x * 0.09, z * 0.05 + 2, 3) - 0.5) * 7), 2) * 1.6;
    return Math.min(-0.9, b);
  }
  /** the ground height at (x, z), computed (slow; use sampleG for baked lookups) */
  G(x: number, z: number): number {
    let g = this.baseDepth(x, z);
    this.lastIsl = -1;
    for (let i = 0; i < this.islands.length; i++) {
      const isl = this.islands[i];
      const R = isl.r * 1.25 * (2 + isl.shelf);
      if (Math.abs(x - isl.x) > R || Math.abs(z - isl.z) > R) continue;
      const d = this.islandD(isl, x, z);
      const h = this.islandH(isl, d, x, z);
      if (h > g) { g = h; this.lastIsl = i; }
    }
    for (const s of this.shelves) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > s.r) continue;
      g = Math.max(g, lerp(-s.depth, -6, smooth(s.r * 0.35, s.r, d)) + (vnoise(x * 2.1, z * 2.1) - 0.5) * 0.18);
    }
    return g;
  }

  private bake() {
    const st = this.step;
    this.x0 = -this.W / 2; this.z0 = this.zBack;
    this.nx = Math.round(this.W / st) + 1;
    this.nz = Math.round((this.zFront - this.zBack) / st) + 1;
    const N = this.nx * this.nz;
    this.g = new Float32Array(N);
    this.veg = new Float32Array(N);
    this.rocky = new Float32Array(N);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const k = j * this.nx + i;
      this.g[k] = this.G(this.x0 + i * st, this.z0 + j * st);
      if (this.lastIsl >= 0) { const kd = this.islands[this.lastIsl].kind; this.veg[k] = VEG[kd]; this.rocky[k] = ROCKY[kd]; }
    }
    // foam distance: from every water cell to the nearest land / rock (two-pass chamfer)
    const D = new Float32Array(N).fill(1e9);
    for (let k = 0; k < N; k++) if (this.g[k] > -0.015) D[k] = 0;
    for (const r of this.rocks) {
      if (r.h <= 0) continue;
      const rad = r.s * 0.75;
      const i0 = Math.floor((r.x - rad - this.x0) / st), i1 = Math.ceil((r.x + rad - this.x0) / st);
      const j0 = Math.floor((r.z - rad - this.z0) / st), j1 = Math.ceil((r.z + rad - this.z0) / st);
      for (let j = Math.max(0, j0); j <= Math.min(this.nz - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(this.nx - 1, i1); i++) {
        if (Math.hypot(this.x0 + i * st - r.x, this.z0 + j * st - r.z) < rad) D[j * this.nx + i] = 0;
      }
    }
    const a = st, b = st * Math.SQRT2, nx = this.nx, nz = this.nz;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; let v = D[k];
      if (i > 0) v = Math.min(v, D[k - 1] + a);
      if (j > 0) { v = Math.min(v, D[k - nx] + a); if (i > 0) v = Math.min(v, D[k - nx - 1] + b); if (i < nx - 1) v = Math.min(v, D[k - nx + 1] + b); }
      D[k] = v;
    }
    for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i; let v = D[k];
      if (i < nx - 1) v = Math.min(v, D[k + 1] + a);
      if (j < nz - 1) { v = Math.min(v, D[k + nx] + a); if (i < nx - 1) v = Math.min(v, D[k + nx + 1] + b); if (i > 0) v = Math.min(v, D[k + nx - 1] + b); }
      D[k] = v;
    }
    this.shore = D;
  }

  /** bilinear lookup in the baked heightfield */
  sampleG(x: number, z: number): number {
    const fx = clamp((x - this.x0) / this.step, 0, this.nx - 1.001), fz = clamp((z - this.z0) / this.step, 0, this.nz - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const k = j * this.nx + i, g = this.g;
    return lerp(lerp(g[k], g[k + 1], tx), lerp(g[k + this.nx], g[k + this.nx + 1], tx), tz);
  }
  /** nearest-cell lookup of a per-cell array */
  cellOf(arr: Float32Array, x: number, z: number): number {
    const i = clamp(Math.round((x - this.x0) / this.step), 0, this.nx - 1), j = clamp(Math.round((z - this.z0) / this.step), 0, this.nz - 1);
    return arr[j * this.nx + i];
  }
  sampleShore(x: number, z: number): number {
    const i = clamp(Math.round((x - this.x0) / this.step), 0, this.nx - 1), j = clamp(Math.round((z - this.z0) / this.step), 0, this.nz - 1);
    return this.shore[j * this.nx + i];
  }
  /** is (x, z) open water deep enough for a boat / fish, with clearance r from land */
  isWater(x: number, z: number, r = 0.3, minDepth = 0.25): boolean {
    if (this.sd(x, z) < r + 0.3 || z > this.zFront - 0.5) return false;
    return this.sampleG(x, z) < -minDepth && this.sampleShore(x, z) > r;
  }
}
