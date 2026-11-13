// The detailed fishing-spot vignettes next to every node: piers with anglers, anchored rowboats, ice-fishing
// holes, trawlers with nets, the hermit crab's shell shop, the turtle spa, wrecks, tournaments and the boss
// ships. Static parts go into one merged atlas mesh; bobbing boats / floaters are their own small meshes.
import * as THREE from 'three';
import { Loft, V3 } from '../gfx/loft';
import { Rng } from '../core/rng';
import { A } from './tex';
import { Layout, Vignette } from './layout';
import { wreckPitch, angler, barrel, beachSet, blob, box, bunting, cleaner, crab, crabShop, crate, fan, lathe, membrane, pier, place, rod, stiltHut, tent, trophyBuoy, turtle, wreck, bottle } from './build';
import { ship, ShipKind, ShipOut } from './ships';

export interface Floater { obj: THREE.Object3D; x: number; z: number; y0: number; amp: number; roll: number; ph: number; spin: number; yaw: number }
export interface Beam { obj: THREE.Object3D; speed: number; sweep?: number; base: number }

export class SpotCtx {
  L = new Loft();
  lines: number[] = [];
  floaters: Floater[] = [];
  palms: { x: number; z: number; s: number; rot: number }[] = [];
  kelp: { x: number; z: number }[] = [];
  coral: { x: number; z: number; r: number; n: number }[] = [];
  schools: { x: number; z: number; r: number }[] = [];
  beams: Beam[] = [];
  halos: V3[] = [];
  /** sunken hulls, so the cutaway can draw their cross-section: centre, heading, keel height, bow-up pitch */
  wrecks: { x: number; z: number; rot: number; keel: number; pitch: number }[] = [];
  group = new THREE.Group();
  constructor(public lay: Layout, public mat: THREE.Material, public beamMat: (k: number) => THREE.Material, public halo: (s: number) => THREE.Object3D) {}

  /** a bobbing object built into its own mesh */
  dyn(build: (L: Loft, lines: number[]) => ShipOut | void, x: number, z: number, rotY: number, o: { amp?: number; roll?: number; y?: number; spin?: number } = {}): Floater {
    const L = new Loft();
    const lines: number[] = [];
    const out = build(L, lines) || null;
    const mesh = new THREE.Mesh(L.build(), this.mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const g = new THREE.Group();
    g.add(mesh);
    if (lines.length) g.add(lineSegs(lines));
    if (out) {
      for (const l of out.lamps) { const h = this.halo(0.22); h.position.set(l[0], l[1], l[2]); g.add(h); }
      for (const b of out.beams) {
        const bm = beamCone(this.beamMat(1), 4.5, 0.55);
        const piv = new THREE.Group(); piv.position.set(b.at[0], b.at[1], b.at[2]); piv.rotation.y = b.dir; piv.add(bm);
        g.add(piv);
        this.beams.push({ obj: piv, speed: 0.5, sweep: 0.7, base: b.dir });
      }
    }
    g.position.set(x, o.y ?? 0, z);
    g.rotation.y = rotY;
    this.group.add(g);
    const f: Floater = { obj: g, x, z, y0: o.y ?? 0, amp: o.amp ?? 0.025, roll: o.roll ?? 0.05, ph: Math.random() * 6.28, spin: o.spin ?? 0, yaw: rotY };
    this.floaters.push(f);
    return f;
  }
}

export function lineSegs(arr: number[], color = '#e8f0f4', opacity = 0.75): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  return m;
}
/** a fishing line: tip -> a sagging point -> the water, plus a tiny bobber */
export function castLine(L: Loft, lines: number[], tip: V3, end: V3, bob = true) {
  const mid: V3 = [(tip[0] + end[0]) / 2, (tip[1] + end[1]) / 2 - 0.08, (tip[2] + end[2]) / 2];
  lines.push(...tip, ...mid, ...mid, ...end);
  if (bob) {
    blob(L, [end[0], end[1] + 0.012, end[2]], 0.022, 0.018, 0.022, A.red, 6);
    blob(L, [end[0], end[1] - 0.004, end[2]], 0.02, 0.012, 0.02, A.white, 6);
  }
}
/** an additive light cone along +x from the origin */
export function beamCone(mat: THREE.Material, len: number, rad: number): THREE.Mesh {
  const g = new THREE.ConeGeometry(rad, len, 16, 1, true);
  g.translate(0, -len / 2, 0);
  g.rotateZ(Math.PI / 2);
  // uv.y = 0 at the lamp, 1 at the far end
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  g.rotateZ(Math.PI);
  g.rotateY(Math.PI);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 6;
  m.frustumCulled = false;
  return m;
}

/** rotY that turns local +x toward (dx, dz) */
const face = (dx: number, dz: number) => Math.atan2(-dz, dx);
const loc = (x: number, z: number, rot: number, lx: number, lz: number): [number, number] => {
  const c = Math.cos(rot), s = Math.sin(rot);
  return [x + lx * c + lz * s, z - lx * s + lz * c];
};

export function buildSpot(v: Vignette, ctx: SpotCtx) {
  const lay = ctx.lay, L = ctx.L, r = new Rng(v.seed);
  const n = v.node;
  const nx = n ? n.x : v.x, nz = n ? n.z : v.z - 1;
  const toNode = face(nx - v.x, nz - v.z);
  const lines = n ? Math.max(1, n.lines) : 1;
  const zoneId = lay.zoneId(v.z);
  const cold = zoneId === 'arctic';
  const night = zoneId === 'abyss' || zoneId === 'trench';
  const shipFloat = (kind: ShipKind, x: number, z: number, rot: number, o: { anglers?: number; pro?: boolean; paint?: number } = {}, castTo?: [number, number]) =>
    ctx.dyn((LL, ln) => {
      const out = ship(LL, kind, r.int(0, 1 << 30), o);
      for (const tip of out.tips) {
        // lines reach outward from the tip toward the water (or toward castTo)
        let ex = tip[0] * 1.25, ez = tip[2] * 1.6 + Math.sign(tip[2] || 1) * 0.25;
        if (castTo) { const c = Math.cos(rot), s = Math.sin(rot); const dx = castTo[0] - x, dz = castTo[1] - z; const lx = dx * c - dz * s, lz = dx * s + dz * c; const l = Math.hypot(lx, lz) || 1; ex = tip[0] + (lx / l) * 0.35; ez = tip[2] + (lz / l) * 0.35; }
        castLine(LL, ln, tip, [ex, -0.0, ez]);
      }
      return out;
    }, x, z, rot, { amp: kind.startsWith('boss') ? 0.012 : 0.02, roll: kind.startsWith('boss') ? 0.012 : 0.05 });

  switch (v.kind) {
    case 'startDock': {
      // a little home jetty reaching in from the front edge of the diorama
      const len = 1.9;
      const x = v.x + 0.5, z0 = lay.zFront + 0.15;
      const from = L.count;
      pier(L, len, v.seed, 0.16, 0.4);
      place(L, from, [x, 0, z0], Math.PI / 2);
      crate(L, [x + 0.12, 0.16, z0 - 0.5], 0.1, 0.3); crate(L, [x + 0.1, 0.26, z0 - 0.5], 0.07, 1.1);
      barrel(L, [x - 0.1, 0.16, z0 - 0.85], 0.05, 0.12);
      // a coil of rope + a sign post pointing into the act
      const rc = L.count;
      lathe(L, [[0.06, 0], [0.07, 0.02], [0.06, 0.04], [0.03, 0.04], [0.03, 0]], 12, A.rope);
      place(L, rc, [x - 0.1, 0.16, z0 - 0.3]);
      rod(L, [x - 0.15, 0.16, z0 - 1.3], [x - 0.15, 0.62, z0 - 1.3], 0.012, 0.012, 5, A.darkWood);
      box(L, [x - 0.15, 0.55, z0 - 1.3], [0.26, 0.08, 0.02], A.sign);
      box(L, [x - 0.2, 0.44, z0 - 1.3], [0.22, 0.07, 0.02], A.sign, 0.3);
      shipFloat('rowboat', x + 0.5, z0 - 0.9, Math.PI / 2 + 0.15, { anglers: 0 });
      break;
    }
    case 'pier': case 'harborDock': {
      const isl = v.island!;
      const dx = nx - isl.x, dz = nz - isl.z, dist = Math.hypot(dx, dz) || 1;
      const ux = dx / dist, uz = dz / dist;
      const s0 = isl.r * 0.55, s1 = dist - 0.7;
      const len = Math.max(0.6, s1 - s0);
      const px = isl.x + ux * s0, pz = isl.z + uz * s0, rot = face(ux, uz);
      const wide = v.kind === 'harborDock';
      const deckY = 0.17 + Math.max(0, lay.sampleG(px, pz)) * 0.5;
      const from = L.count;
      pier(L, len, v.seed, deckY, wide ? 0.55 : 0.36);
      place(L, from, [px, 0, pz], rot);
      // anglers sitting on the end, lines cast toward the node
      const k = Math.min(3, lines);
      for (let i = 0; i < k; i++) {
        const lz = (i - (k - 1) / 2) * 0.13;
        const f = L.count;
        const tip = angler(L, { skin: r.int(0, 3), shirt: r.int(0, 3), pants: r.int(0, 3), hat: r.int(0, 3), hatKind: r.pick(['bucket', 'cap', 'beanie'] as const), sit: true, rodLen: 0.65 });
        const lx = len - 0.08 - (i % 2) * 0.05;
        const [wx, wz] = loc(px, pz, rot, lx, lz);
        place(L, f, [wx, deckY + 0.02, wz], rot + (lz * 1.4));
        const c = Math.cos(rot + lz * 1.4), s = Math.sin(rot + lz * 1.4);
        const t: V3 = [wx + tip[0] * c, deckY + 0.02 + tip[1], wz - tip[0] * s];
        castLine(L, ctx.lines, t, [t[0] + Math.cos(rot) * 0.32 + lz * 0.6, 0, t[2] - Math.sin(rot) * 0.32]);
      }
      if (wide) {
        // moored fishing boat alongside, crates and a little crane
        const [bx, bz] = loc(px, pz, rot, len * 0.55, 0.62);
        shipFloat('fishing', bx, bz, rot + Math.PI, { anglers: 0 });
        for (let i = 0; i < 4; i++) { const [cx, cz] = loc(px, pz, rot, 0.2 + i * 0.13, -0.16); crate(L, [cx, deckY + 0.01, cz], 0.1, rot + i); }
        const [kx, kz] = loc(px, pz, rot, 0.35, 0.2);
        rod(L, [kx, deckY, kz], [kx, deckY + 0.75, kz], 0.02, 0.016, 5, A.yellow);
        const [jx, jz] = loc(px, pz, rot, 0.75, 0.55);
        rod(L, [kx, deckY + 0.72, kz], [jx, deckY + 0.6, jz], 0.014, 0.012, 4, A.yellow);
        ctx.lines.push(jx, deckY + 0.6, jz, jx, deckY + 0.25, jz);
        crate(L, [jx, deckY + 0.13, jz], 0.12, rot);
        // warehouse on the island
        const g0 = Math.max(0, lay.sampleG(isl.x, isl.z));
        box(L, [isl.x, g0 + 0.2, isl.z], [0.6, 0.42, 0.45], A.wallDoor, rot);
        const rf = L.count;
        box(L, [0, 0, 0], [0.7, 0.03, 0.3], A.tin);
        place(L, rf, [isl.x + Math.sin(rot) * 0.1, g0 + 0.47, isl.z + Math.cos(rot) * 0.1], rot, 1, 0.45);
        const rf2 = L.count;
        box(L, [0, 0, 0], [0.7, 0.03, 0.3], A.tin);
        place(L, rf2, [isl.x - Math.sin(rot) * 0.1, g0 + 0.47, isl.z - Math.cos(rot) * 0.1], rot, 1, -0.45);
      } else if (isl.r > 0.9 && !cold) {
        const g0 = Math.max(0, lay.sampleG(isl.x, isl.z));
        const f = L.count;
        stiltHut(L, v.seed + 3, 0.05);
        place(L, f, [isl.x - ux * 0.25, g0, isl.z - uz * 0.25], rot, 0.8);
        ctx.palms.push({ x: isl.x + uz * 0.5, z: isl.z - ux * 0.5, s: 0.9, rot: r.range(0, 6) });
      }
      break;
    }
    case 'rowboat': case 'reefDinghy': {
      const kind = v.kind === 'rowboat' ? 'rowboat' : 'dinghy';
      const rot = toNode + Math.PI / 2 + r.range(-0.3, 0.3);
      shipFloat(kind, v.x, v.z, rot, { anglers: Math.min(2, lines) }, [nx, nz]);
      if (lines >= 3) {
        const [x2, z2] = loc(v.x, v.z, rot, -0.9, 0.35);
        if (lay.isWater(x2, z2, 0.3)) shipFloat('dinghy', x2, z2, rot + 0.5, { anglers: 1 }, [nx, nz]);
      }
      // anchor rope from the bow straight down
      const [ax, az] = loc(v.x, v.z, rot, 0.45, 0);
      ctx.lines.push(ax, 0.05, az, ax + 0.05, -1.2, az);
      if (v.kind === 'reefDinghy') ctx.coral.push({ x: nx, z: nz, r: 1.9, n: 30 });
      break;
    }
    case 'canoeKelp': {
      shipFloat('canoe', v.x, v.z, toNode + Math.PI / 2 + r.range(-0.4, 0.4), { anglers: 1 }, [nx, nz]);
      for (let i = 0; i < 26; i++) {
        const a = r.range(0, 6.28), d = r.range(0.45, 1.7);
        const x = nx + Math.cos(a) * d, z = nz + Math.sin(a) * d;
        if (lay.clearance(x, z, 0.3, 0.12) > 0 && lay.isWater(x, z, 0.1, 0.6)) ctx.kelp.push({ x, z });
      }
      break;
    }
    case 'iceHole': {
      const isl = v.island!;
      const top = Math.max(0.02, lay.sampleG(isl.x, isl.z));
      const dx = nx - isl.x, dz = nz - isl.z, dl = Math.hypot(dx, dz) || 1;
      const hx = isl.x + (dx / dl) * 0.15, hz = isl.z + (dz / dl) * 0.15;
      const hy = Math.max(top, lay.sampleG(hx, hz)) + 0.006;
      const ring: V3[] = []; for (let k = 0; k < 12; k++) { const a = (k / 12) * 6.28; ring.push([hx + Math.cos(a) * 0.12, hy, hz + Math.sin(a) * 0.1]); }
      fan(L, ring, A.bluePaint, [0, 1, 0]);
      for (let k = 0; k < 7; k++) { const a = (k / 7) * 6.28; blob(L, [hx + Math.cos(a) * 0.14, hy, hz + Math.sin(a) * 0.12], 0.04, 0.02, 0.035, A.snow, 6); }
      const rot = face(hx - (isl.x - (dx / dl) * 0.15), hz - (isl.z - (dz / dl) * 0.15));
      const [sx, sz] = loc(hx, hz, rot, -0.28, 0);
      const bk = L.count; lathe(L, [[0.04, 0], [0.045, 0.07], [0.0, 0.07]], 8, A.bluePaint, { capBot: true }); place(L, bk, [sx, hy, sz]);
      const f = L.count;
      const tip = angler(L, { skin: r.int(0, 3), shirt: r.int(0, 3), pants: r.int(0, 3), hat: r.int(0, 3), hatKind: 'beanie', sit: true, rodLen: 0.32, beard: r.chance(0.5) });
      place(L, f, [sx, hy + 0.07, sz], rot);
      const c = Math.cos(rot), s = Math.sin(rot);
      const t: V3 = [sx + tip[0] * c, hy + 0.07 + tip[1], sz - tip[0] * s];
      ctx.lines.push(...t, hx, hy - 0.05, hz);
      const [tx, tz] = loc(isl.x, isl.z, rot, -0.45, 0.25);
      const tf = L.count; tent(L); place(L, tf, [tx, Math.max(top, lay.sampleG(tx, tz)), tz], rot);
      // a tiny snowman + a caught fish on the ice
      const [mx, mz] = loc(isl.x, isl.z, rot, 0.05, -0.42);
      const my = Math.max(top, lay.sampleG(mx, mz));
      blob(L, [mx, my + 0.06, mz], 0.07, 0.065, 0.07, A.snow, 8); blob(L, [mx, my + 0.15, mz], 0.05, 0.045, 0.05, A.snow, 8); blob(L, [mx, my + 0.21, mz], 0.035, 0.035, 0.035, A.snow, 8);
      box(L, [mx + 0.035, my + 0.21, mz], [0.03, 0.008, 0.008], A.yellow);
      blob(L, [sx + 0.12, hy + 0.01, sz + 0.12], 0.05, 0.012, 0.018, A.metal, 6);
      for (let k = 1; k < lines; k++) {
        const a = r.range(0, 6.28);
        const ox = isl.x + Math.cos(a) * 0.45, oz = isl.z + Math.sin(a) * 0.35;
        const oy = Math.max(0.02, lay.sampleG(ox, oz));
        rod(L, [ox, oy, oz], [ox + 0.1, oy + 0.28, oz + 0.05], 0.004, 0.003, 3, A.rod);
        ctx.lines.push(ox + 0.1, oy + 0.28, oz + 0.05, ox + 0.12, oy - 0.02, oz + 0.06);
      }
      break;
    }
    case 'trawler': {
      shipFloat('trawler', v.x, v.z, toNode + Math.PI / 2 + r.range(-0.25, 0.25), { anglers: Math.min(2, lines) }, [nx, nz]);
      break;
    }
    case 'beach': {
      const isl = v.island!;
      const dx = nx - isl.x, dz = nz - isl.z, dl = Math.hypot(dx, dz) || 1;
      const rot = face(dx, dz);
      const [bx, bz] = loc(isl.x, isl.z, rot, isl.r * 0.1, -0.15);
      const f = L.count; beachSet(L, v.seed); place(L, f, [bx, Math.max(0.02, lay.sampleG(bx, bz)), bz], rot);
      const ax = isl.x + (dx / dl) * isl.r * 0.82, az = isl.z + (dz / dl) * isl.r * 0.82;
      const af = L.count;
      const tip = angler(L, { skin: r.int(0, 3), shirt: r.int(0, 3), pants: r.int(0, 3), hat: r.int(0, 3), hatKind: 'cap', rodLen: 0.95 });
      const ay = Math.max(0.0, lay.sampleG(ax, az));
      place(L, af, [ax, ay, az], rot);
      const c = Math.cos(rot), s = Math.sin(rot);
      const t: V3 = [ax + tip[0] * c, ay + tip[1], az - tip[0] * s];
      castLine(L, ctx.lines, t, [t[0] + (dx / dl) * 0.5, 0, t[2] + (dz / dl) * 0.5]);
      for (let k = 1; k < Math.min(3, lines); k++) {
        const [rx, rz] = loc(isl.x, isl.z, rot, isl.r * 0.6, (k % 2 ? 1 : -1) * 0.3);
        const ry = Math.max(0, lay.sampleG(rx, rz));
        rod(L, [rx, ry - 0.02, rz], [rx + c * 0.45, ry + 0.4, rz - s * 0.45], 0.006, 0.003, 3, A.rod);
        castLine(L, ctx.lines, [rx + c * 0.45, ry + 0.4, rz - s * 0.45], [rx + c * 0.85, 0, rz - s * 0.85]);
      }
      ctx.palms.push({ x: isl.x - (dx / dl) * 0.4 + (dz / dl) * 0.3, z: isl.z - (dz / dl) * 0.4 - (dx / dl) * 0.3, s: 1.0, rot: r.range(0, 6) });
      break;
    }
    case 'tournament': {
      // pro anglers' boats circling the spot + bunting + the judge's trophy buoy
      const k = Math.max(3, Math.min(4, Math.ceil(lines / 2)));
      const angs: number[] = [];
      for (let i = 0; i < 24 && angs.length < k; i++) {
        const a = r.range(0, 6.28), d = r.range(1.25, 1.5);
        const x = nx + Math.cos(a) * d, z = nz + Math.sin(a) * d;
        if (angs.some((b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.9)) continue;
        if (lay.clearance(x, z, 0.0, 0.35) < 0.15 || !lay.isWater(x, z, 0.3)) continue;
        angs.push(a);
        const kind: ShipKind = r.pick(['fishing', 'rowboat', 'dinghy'] as const);
        shipFloat(kind, x, z, face(nx - x, nz - z) + Math.PI / 2, { anglers: kind === 'fishing' ? 2 : 1, pro: true, paint: r.pick([0, 1, 4]) }, [nx, nz]);
      }
      const a0 = (angs[0] ?? 0) + Math.PI;
      const p1: V3 = [nx + Math.cos(a0 - 0.4) * 1.0, 0, nz + Math.sin(a0 - 0.4) * 1.0];
      const p2: V3 = [nx + Math.cos(a0 + 0.4) * 1.0, 0, nz + Math.sin(a0 + 0.4) * 1.0];
      if (lay.clearance(p1[0], p1[2], 0, 0.15) > 0 && lay.clearance(p2[0], p2[2], 0, 0.15) > 0) {
        for (const p of [p1, p2]) { rod(L, [p[0], -1.5, p[2]], [p[0], 0.8, p[2]], 0.016, 0.012, 5, A.white); const cf = L.count; lathe(L, [[0.02, 0], [0.03, 0.02], [0.0, 0.05]], 6, A.gold, { capBot: true }); place(L, cf, [p[0], 0.8, p[2]]); }
        bunting(L, [p1[0], 0.78, p1[2]], [p2[0], 0.78, p2[2]], 10, v.seed);
      }
      const ta = a0 + Math.PI * 0.5;
      const tx = nx + Math.cos(ta) * 0.95, tz = nz + Math.sin(ta) * 0.95;
      if (lay.isWater(tx, tz, 0.15)) ctx.dyn((LL) => { trophyBuoy(LL); }, tx, tz, 0, { amp: 0.03, roll: 0.08 });
      break;
    }
    case 'crabShop': {
      const isl = v.island!;
      const rot = face(nx - isl.x, nz - isl.z);
      const y0 = Math.max(0.02, lay.sampleG(isl.x, isl.z));
      const f = L.count; crabShop(L); place(L, f, [isl.x, y0 - 0.02, isl.z], rot, 0.95);
      const cf = L.count; crab(L); const [cx, cz] = loc(isl.x, isl.z, rot, 0.14, 0); place(L, cf, [cx, y0, cz], rot, 0.9);
      const [lx, lz] = loc(isl.x, isl.z, rot, 0.25, -0.38);
      rod(L, [lx, y0, lz], [lx, y0 + 0.45, lz], 0.008, 0.008, 4, A.darkWood);
      box(L, [lx, y0 + 0.47, lz], [0.05, 0.06, 0.05], A.lamp);
      ctx.halos.push([lx, y0 + 0.47, lz]);
      for (let k = 0; k < 3; k++) { const [bx, bz] = loc(isl.x, isl.z, rot, -0.25 + k * 0.08, 0.42); barrel(L, [bx, Math.max(0, lay.sampleG(bx, bz)), bz], 0.045, 0.1); }
      break;
    }
    case 'turtleSpa': {
      const fl = ctx.dyn((LL) => {
        turtle(LL, 1.15);
        rod(LL, [-0.02, 0.1, 0.02], [-0.04, 0.5, 0.04], 0.006, 0.006, 4, A.white);
        const top: V3 = [-0.04, 0.5, 0.04];
        const P: V3[][] = [[], []];
        for (let k = 0; k <= 8; k++) { const a = (k / 8) * 6.28; P[0].push([top[0], top[1] + 0.05, top[2]]); P[1].push([top[0] + Math.cos(a) * 0.24, top[1] - 0.03, top[2] + Math.sin(a) * 0.24]); }
        membrane(LL, P, A.umbrella);
        // a towel and a tiny cucumber-slice spa vibe
        box(LL, [0.08, 0.12, -0.05], [0.16, 0.01, 0.1], A.awning);
      }, v.x, v.z, toNode + Math.PI / 2, { amp: 0.015, roll: 0.03, spin: 0.05 });
      fl.y0 = -0.02;
      for (let k = 0; k < 5; k++) {
        const a = r.range(0, 6.28), d = r.range(0.45, 0.9);
        const x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
        if (lay.clearance(x, z, 0.25, 0.1) < 0) continue;
        const pts: V3[] = []; for (let i = 0; i < 9; i++) { const b = (i / 9) * 6.28; if (i === 0) continue; pts.push([x + Math.cos(b + a) * 0.11, 0.042, z + Math.sin(b + a) * 0.11]); }
        pts.push([x, 0.042, z]);
        fan(L, pts, A.moss, [0, 1, 0]);
        if (k % 2 === 0) blob(L, [x + 0.03, 0.05, z], 0.025, 0.012, 0.025, A.coral, 6);
      }
      break;
    }
    case 'cleaner': {
      const g = lay.sampleG(v.x, v.z);
      const f = L.count; cleaner(L, v.seed); place(L, f, [v.x, g, v.z], r.range(0, 6));
      ctx.schools.push({ x: v.x, z: v.z, r: 0.7 });
      ctx.coral.push({ x: v.x, z: v.z, r: 1.2, n: 14 });
      break;
    }
    case 'wreck': {
      const g = lay.sampleG(v.x, v.z);
      const mast = -g + (n ? 0.85 : -0.3);
      const f = L.count;
      const top = wreck(L, v.seed, Math.max(0.4, mast));
      const rot = n ? toNode + Math.PI / 2 : v.ang;
      if (!n) { ctx.schools.push({ x: v.x, z: v.z - 1.2, r: 0.8 }); }
      place(L, f, [v.x, g - 0.12, v.z], rot);
      ctx.wrecks.push({ x: v.x, z: v.z, rot, keel: g - 0.12, pitch: wreckPitch(v.seed) });
      if (n) {
        // tattered black flag on the mast top
        const c = Math.cos(rot), s = Math.sin(rot);
        const tx = v.x + top[0] * c + top[2] * s, tz = v.z - top[0] * s + top[2] * c, ty = g - 0.12 + top[1];
        ctx.dyn((LL) => {
          membrane(LL, [[[0, 0, 0], [-0.1, -0.01, 0], [-0.22, 0.01, 0]], [[0, -0.14, 0], [-0.11, -0.15, 0], [-0.2, -0.12, 0]]], A.black);
          rod(LL, [0, -0.3, 0], [0, 0.03, 0], 0.012, 0.01, 4, A.darkWood);
        }, tx, tz, rot, { y: ty, amp: 0.0, roll: 0.02 });
        for (let k = 0; k < 2; k++) {
          const a = r.range(0, 6.28), d = r.range(0.5, 0.9);
          const x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d;
          if (lay.clearance(x, z, 0.3, 0.12) > 0) ctx.dyn((LL) => { barrel(LL, [0, -0.06, 0], 0.05, 0.11); }, x, z, a, { amp: 0.02, roll: 0.25 });
        }
        ctx.schools.push({ x: v.x, z: v.z, r: 0.9 });
      }
      break;
    }
    case 'mystery': {
      // drifting flotsam
      for (let k = 0; k < 3; k++) {
        const a = r.range(0, 6.28), d = r.range(0.6, 1.1);
        const x = nx + Math.cos(a) * d, z = nz + Math.sin(a) * d;
        if (lay.clearance(x, z, 0.25, 0.12) < 0 || !lay.isWater(x, z, 0.1)) continue;
        ctx.dyn((LL) => { if (k === 0) bottle(LL, 0.5); else box(LL, [0, 0.005, 0], [0.28, 0.02, 0.06], A.darkWood); }, x, z, r.range(0, 6), { amp: 0.02, roll: 0.15, spin: 0.08 });
      }
      break;
    }
    case 'boss': {
      const act = lay.map.act;
      const kind: ShipKind = act === 1 ? 'boss1' : act === 2 ? 'boss2' : 'boss3';
      shipFloat(kind, v.x, v.z, r.range(-0.15, 0.15), {}, [nx, nz]);
      if (act === 2) for (let k = 0; k < 6; k++) {
        const a = r.range(0, 6.28), d = r.range(2.6, 3.6);
        const x = v.x + Math.cos(a) * d, z = v.z + Math.sin(a) * d * 0.6;
        if (lay.clearance(x, z, 0.5, 0.25) < 0.1) continue;
        ctx.dyn((LL) => { blob(LL, [0, 0.0, 0], r.range(0.2, 0.4), 0.06, r.range(0.15, 0.3), A.ice, 9, 0.3, k); }, x, z, a, { amp: 0.01, roll: 0.02, spin: 0.03 });
      }
      break;
    }
  }
  void night;
}
