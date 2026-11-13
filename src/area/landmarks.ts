// The set pieces that give each area its identity:
//   reef      - natural limestone arches, coral bommies crowned with corals, sun shafts;
//   kelp      - the cathedral: ranks of giant kelp columns with bright aisles of light between them;
//   graveyard - a field of dead hulls (bow-down, keeled over, broken in two), bare ribs in the sand, anchors,
//               cannons and chain;
//   arctic    - an ice shelf ceiling with open leads, hanging pressure keels, icebergs and brinicles;
//   abyss     - black-smoker vents with glowing throats and smoke plumes, a whale fall skeleton, pillow lava.
import * as THREE from 'three';
import type { World } from '../game/types';
import type { Scenery } from './scenery';
import { Soup, V3, mat4 } from '../world/lp';
import { arch, boulder, iceberg, crustPainter } from '../world/rockgen';
import { buildShip } from './wreck';
import type { WreckKind } from './defs';
import { Rng } from '../core/rng';
import { fbm, hash2 } from '../core/math';
import { FRONT_Z } from '../gfx/water/surface';
import { additiveMaterial } from '../world/mats';

const TAU = Math.PI * 2;

export function buildLandmarks(scen: Scenery, group: THREE.Group, w: World) {
  const r = new Rng(scen.seed ^ 0x1a4d);
  switch (scen.a.id) {
    case 'reef': reef(scen, r); shafts(scen, group, r, 6, '#fff4d0', 0.5); break;
    case 'kelp': kelp(scen, group, r); break;
    case 'graveyard': graveyard(scen, r); break;
    case 'arctic': arctic(scen, group, r, w); break;
    case 'abyss': abyss(scen, group, r, w); break;
  }
}

// ------------------------------------------------------------------ light shafts (additive sheets from the surface)
function shafts(scen: Scenery, group: THREE.Group, r: Rng, n: number, color: string, k: number, xs?: number[]) {
  const g = new THREE.BufferGeometry();
  const pos: number[] = [], col: number[] = [];
  const sh = scen.shape;
  const list = xs ?? Array.from({ length: n }, () => r.range(sh.X0, sh.X1));
  for (const x0 of list) {
    const z = r.range(-14, -4), wdt = r.range(1.2, 3.2), lean = 0.32;
    const bot = scen.heightAt(x0, z);
    const top = 0, len = top - bot;
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI;
      const dx = Math.cos(a) * wdt * 0.5, dz = Math.sin(a) * wdt * 0.5;
      const xb = x0 + len * lean;
      // a quad from the surface down to the seabed, bright on top fading out
      const P: V3[] = [[x0 - dx, top, z - dz], [x0 + dx, top, z + dz], [xb + dx * 1.6, bot, z + dz * 1.6], [xb - dx * 1.6, bot, z - dz * 1.6]];
      const C = [1, 1, 0.1, 0.1];
      for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) for (const i of [i0, i1, i2]) { pos.push(...P[i]); col.push(C[i] * k, C[i] * k, C[i] * k); }
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, additiveMaterial(color));
  m.renderOrder = 12;
  m.frustumCulled = false;
  group.add(m);
  const mat = m.material as THREE.MeshBasicMaterial;
  scen.updaters.push((_dt, _cx, t) => { mat.opacity = 0.75 + Math.sin(t * 0.4) * 0.15 + Math.sin(t * 1.3) * 0.08; });
  scen.disposables.push(g, mat);
}

// ------------------------------------------------------------------ reef
function reef(scen: Scenery, r: Rng) {
  const sh = scen.shape;
  // arches: one in the mid ground, one huge one far back
  const archs: [number, number, number, number][] = [[r.range(sh.X0 + 20, sh.wreckX - 18), -8, 5, 6.5], [r.range(sh.wreckX + 16, sh.X1 - 25), -12, 7, 8], [r.range(sh.X0, sh.X1), -34, 14, 13]];
  for (const [x, z, half, H] of archs) {
    const y = scen.heightAt(x, z);
    const top = Math.min(H, -y - 3);
    const s = arch(scen.seed + x * 13);
    scen.addRock(s, x, y - 0.4, z, half, top, half * 0.75, r.range(-0.3, 0.3), { topK: 1 });
    // corals crowning the arch
    for (let i = 0; i < 10; i++) {
      const u = r.range(-0.7, 0.7), xx = x + u * half;
      const yy = y - 0.4 + Math.cos(u * Math.PI / 2 * 0.95) * top * 0.98;
      placeFloraAt(scen, r.pick(['staghorn', 'brain', 'seafan', 'softcoral', 'tubesponge', 'sargassum']), xx, yy, z + r.range(-0.6, 0.6), r.range(0.7, 1.2));
    }
  }
  // bommies: coral heads on rock mounds
  for (let i = 0; i < 9; i++) {
    const x = r.range(sh.X0 + 6, sh.X1 - 6), z = r.range(-3, -15);
    if (scen.isReserved(x, z, 1)) continue;
    const y = scen.heightAt(x, z), R = r.range(1.2, 2.4), H = R * r.range(0.8, 1.3);
    scen.addRock(r.pick(scen.shapes('bigboulder')), x, y - R * 0.3, z, R, H, R, r.range(0, 6), { topK: 1.2 });
    for (let k = 0; k < 9; k++) {
      const a = r.range(0, TAU), d = r.range(0, R * 0.7);
      placeFloraAt(scen, r.pick(['staghorn', 'brain', 'brain', 'table', 'seafan', 'softcoral', 'tubesponge', 'anemoneSmall', 'featheralgae']), x + Math.cos(a) * d, y - R * 0.3 + H * 0.85, z + Math.sin(a) * d * 0.8, r.range(0.8, 1.3));
    }
  }
}

function placeFloraAt(scen: Scenery, sp: string, x: number, y: number, z: number, sc: number) { scen.placePlant(sp, x, y, z, sc); }

// ------------------------------------------------------------------ kelp cathedral
function kelp(scen: Scenery, group: THREE.Group, r: Rng) {
  const sh = scen.shape;
  // aisles: open lanes every ~16 m where the light pours in; ranks of kelp columns between them
  const aisles: number[] = [];
  for (let x = sh.X0 + 8; x < sh.X1; x += r.range(13, 19)) aisles.push(x);
  for (const z of [-5.5, -9, -14, -22]) {
    for (let x = sh.X0 - 20; x < sh.X1 + 20; x += r.range(1.6, 2.8) * (z < -12 ? 1.5 : 1)) {
      if (aisles.some((a) => Math.abs(a - x) < 2.6)) continue;
      if (scen.isReserved(x, z, 0.5)) continue;
      const zz = z + r.range(-0.8, 0.8), y = scen.heightAt(x, zz);
      const reach = -y - r.range(0.3, 1.2);
      if (reach < 3) continue;
      scen.placeSprite(r.chance(0.18) ? 'bullkelp' : 'giantkelp', x, y - 0.05, zz, 1, r, reach);
    }
  }
  // the canopy: kelp fronds matting the surface cast it in gold; shafts down the aisles
  shafts(scen, group, r, 0, '#fff0c0', 0.6, aisles.flatMap((x) => [x - 0.8, x + 0.7]));
  // boulders at the column feet
  for (let i = 0; i < 20; i++) {
    const x = r.range(sh.X0, sh.X1), z = r.range(-3, -14);
    if (scen.isReserved(x, z, 1)) continue;
    const y = scen.heightAt(x, z), R = r.range(0.7, 1.8);
    scen.addRock(r.pick(scen.shapes('boulder')), x, y - R * 0.35, z, R, R * r.range(0.6, 1), R, r.range(0, 6), { topK: 1.1 });
  }
}

// ------------------------------------------------------------------ shipwreck graveyard
function graveyard(scen: Scenery, r: Rng) {
  const sh = scen.shape;
  const kinds: WreckKind[] = ['sloop', 'trawler', 'galleon', 'steamer', 'sloop', 'galleon'];
  const spots: [number, number][] = [[sh.X0 + 18, -14], [sh.wreckX - 26, -22], [sh.wreckX + 24, -12], [sh.X1 - 22, -28], [sh.X0 + 45, -36], [sh.X1 - 50, -40]];
  spots.forEach(([x, z], i) => {
    const kind = kinds[i % kinds.length];
    const parts = buildShip(kind, scen, (x * 77) | 0);
    const y = scen.heightAt(x, z);
    // poses: keeled over, bow-down and buried, broken-backed, upright and sunk to the deck
    const pose = i % 4;
    const rx = pose === 0 ? 0.9 : pose === 2 ? 0.25 : 0.1, rz = pose === 1 ? 0.55 : pose === 2 ? -0.1 : 0.04, ry = r.range(-0.5, 0.5) + (i % 2 ? Math.PI : 0);
    const sink = pose === 1 ? 2.5 : pose === 3 ? 1.6 : 0.8;
    const m = mat4(x, y - sink, z, 1, 1, 1, ry, rx, rz);
    const ch = scen.chunk(x);
    for (const k of ['hullBroken', 'deckBroken', 'mastBroken', 'cabin', 'rigging'] as const) ch.prop.append(parts[k], m);
    if (pose !== 1) ch.prop.append(parts.sailTorn, m);
    ch.flora.append(parts.growth, m);
  });
  // ribs of long-gone hulls sticking out of the silt
  for (let i = 0; i < 7; i++) {
    const x = r.range(sh.X0 + 6, sh.X1 - 6), z = i < 3 ? r.range(-2.2, -0.8) : r.range(-4, -16);
    if (scen.isReserved(x, z, 1)) continue;
    const y = scen.heightAt(x, z), L = r.range(4, 8), ry = r.range(-0.6, 0.6);
    const s = new Soup(), reg = scen.props.get('planksOld');
    for (let k = 0; k < Math.round(L / 0.7); k++) {
      const xx = -L / 2 + k * 0.7, H = r.range(1.2, 2.6) * (1 - Math.abs(xx / L) * 0.6);
      const path: V3[] = [];
      for (let q = 0; q <= 4; q++) { const t = q / 4; path.push([xx, Math.sin(t * Math.PI * 0.55) * H, -Math.cos(t * Math.PI * 0.55) * 1.2 + 1.2]); }
      s.tube(path, (t) => 0.1 * (1 - t * 0.5), 4, reg, { tip: true });
      const p2 = path.map((q) => [q[0], q[1], -q[2]] as V3);
      if (r.chance(0.7)) s.tube(p2, (t) => 0.1 * (1 - t * 0.5), 4, reg, { tip: true });
    }
    s.tube([[-L / 2, 0.05, 0], [L / 2, 0.05, 0]], () => 0.16, 4, reg); // keel
    scen.chunk(x).prop.append(s, mat4(x, y - 0.3, z, 1, 1, 1, ry, 0, r.range(-0.08, 0.08)));
  }
  // anchors, cannons, chain on the gameplay floor and in front
  for (let i = 0; i < 12; i++) {
    const x = r.range(sh.X0 + 4, sh.X1 - 4), z = r.chance(0.5) ? r.range(-1, 0.6) : r.range(1.2, 2.6);
    if (scen.isReserved(x, z)) continue;
    const y = scen.heightAt(x, z);
    const s = new Soup(), ir = scen.props.get('iron');
    if (i % 3 === 0) {
      // anchor
      s.tube([[0, 0, 0], [0, 1.6, 0]], () => 0.07, 4, ir);
      s.tube([[-0.7, 0.45, 0], [-0.45, 0.12, 0], [0, 0, 0], [0.45, 0.12, 0], [0.7, 0.45, 0]], () => 0.07, 4, ir, { tip: true });
      s.tube([[-0.4, 1.4, 0], [0.4, 1.4, 0]], () => 0.05, 4, ir);
      scen.chunk(x).prop.append(s, mat4(x, y + 0.05, z, 1, 1, 1, r.range(0, 6), 0, r.range(1.1, 1.4) * (r.chance(0.5) ? 1 : -1)));
    } else if (i % 3 === 1) {
      // cannon
      s.lathe([[0.2, 0], [0.18, 0.6], [0.14, 1.5], [0.17, 1.55], [0.17, 1.65]], 7, ir);
      scen.chunk(x).prop.append(s, mat4(x, y + 0.1, z, 1, 1, 1, r.range(0, 6), 0, Math.PI / 2 + r.range(-0.15, 0.15)));
    } else {
      // a length of heavy chain snaking over the silt
      const path: V3[] = [];
      for (let q = 0; q <= 8; q++) path.push([q * 0.45 - 1.8, 0.06 + Math.max(0, Math.sin(q * 0.9)) * 0.1, Math.sin(q * 0.7) * 0.4]);
      s.tube(path, () => 0.06, 4, ir);
      scen.chunk(x).prop.append(s, mat4(x, y, z, 1, 1, 1, r.range(0, 6)));
    }
  }
}

// ------------------------------------------------------------------ arctic ice shelf
function arctic(scen: Scenery, group: THREE.Group, r: Rng, w: World) {
  const sh = scen.shape;
  // open leads in the ice (boats come through these), the rest is a ceiling
  const leads: [number, number][] = [];
  for (let x = sh.X0 + 16; x < sh.X1 - 10; x += r.range(28, 40)) leads.push([x, x + r.range(5, 8)]);
  const open = (x: number) => leads.some(([a, b]) => x > a && x < b);
  const thick = (x: number, z: number) => 0.7 + fbm(x * 0.08, z * 0.08, 3, scen.seed % 97) * 1.4 + Math.max(0, fbm(x * 0.03, z * 0.05, 2, 7) - 0.6) * 9;
  const reg = scen.props.get('ice');
  const s = new Soup();
  const step = 2, rows = [FRONT_Z, 1, -1, -3.5, -7, -12, -18, -26, -36, -48, -62];
  for (let x = sh.X0 - 40; x < sh.X1 + 40; x += step) {
    for (let j = 0; j < rows.length - 1; j++) {
      const z0 = rows[j], z1 = rows[j + 1];
      if (open(x + step / 2) && z0 > -12) continue;
      const q = (xx: number, zz: number): V3 => [xx, -thick(xx, zz) + (hash2(Math.round(xx), Math.round(zz), 3) - 0.5) * 0.3, zz];
      const a = q(x, z0), b = q(x + step, z0), c = q(x + step, z1), d = q(x, z1);
      // the underside faces down: glowing with transmitted daylight
      s.glow(0.55).quad(a, d, c, b, reg, [1, 1, 1, 1]);
    }
    // the cliff faces of the leads
    for (const [la, lb] of leads) for (const ex of [la, lb]) if (Math.abs(x - ex) < step / 2) {
      for (let j = 0; j < 4; j++) {
        const z0 = rows[j], z1 = rows[j + 1], t0 = thick(ex, z0), t1 = thick(ex, z1);
        s.glow(0.4).quad([ex, 0.3, z0], [ex, -t0, z0], [ex, -t1, z1], [ex, 0.3, z1], reg, [1, 0.8, 0.8, 1]);
        s.quad([ex, 0.3, z1], [ex, -t1, z1], [ex, -t0, z0], [ex, 0.3, z0], reg, [1, 0.8, 0.8, 1]);
      }
    }
  }
  s.glow(0);
  scen.chunk(0).prop.append(s, new THREE.Matrix4());
  // the ceiling is solid for gameplay
  scen.terrain.ceiling = (x) => (open(x) ? null : -thick(x, 0) + 0.1);
  // icebergs: huge keels hanging from the shelf in the background, a couple close
  for (let i = 0; i < 6; i++) {
    const x = r.range(sh.X0, sh.X1), z = i < 2 ? r.range(-6, -9) : r.range(-14, -40);
    const keel = r.range(5, 10), wdt = r.range(4, 9);
    const b = iceberg(scen.seed + i * 31);
    const ch = scen.chunk(x);
    const from = ch.prop.count;
    ch.prop.append(b, mat4(x, -keel, z, wdt, keel + 0.5, wdt * 0.7, r.range(0, 6)), { uv: reg, glow: 0.35 });
    void from;
  }
  // brinicles: thin ice stalactites
  for (let i = 0; i < 18; i++) {
    const x = r.range(sh.X0, sh.X1), z = r.range(-1.5, -12);
    if (open(x)) continue;
    const top = -thick(x, z), L = r.range(1, 3.5);
    const bs = new Soup();
    bs.glow(0.5).tube([[0, 0, 0], [0.05, -L * 0.5, 0], [0, -L, 0.03]], (t) => 0.12 * (1 - t * 0.85), 5, reg, { tip: true });
    scen.chunk(x).prop.append(bs, mat4(x, top + 0.2, z, 1, 1, 1, r.range(0, 6)));
  }
  // light through the leads
  shafts(scen, group, r, 0, '#e8f8ff', 0.7, leads.flatMap(([a, b]) => [a + 1.5, (a + b) / 2, b - 1.5]));
  void w;
}

// ------------------------------------------------------------------ abyss
function abyss(scen: Scenery, group: THREE.Group, r: Rng, w: World) {
  const sh = scen.shape;
  const vents: { x: number; y: number; z: number; h: number }[] = [];
  const reg = scen.props.A.paint('ventChimney', 32, 32, (p, wd, h) => {
    p.fill((x, y) => {
      const n = fbm(x * 0.2, y * 0.2, 3, 5);
      if (n > 0.62) return [200 * (n - 0.3), 150 * (n - 0.3), 40];   // sulfur crust
      if (n < 0.35) return [60, 30, 18];                             // rusty iron sulfide
      return [18 + n * 20, 16 + n * 18, 18 + n * 16];
    });
    for (let i = 0; i < 30; i++) p.set(hash2(i, 1, 9) * wd, hash2(i, 2, 9) * h, '#e8e0d0');
  });
  const throat = scen.props.A.paint('ventThroat', 8, 8, (p) => p.fill((x, y) => [255, 140 + y * 10, 40 + x * 5]));
  const vx = [sh.wreckX + 18, sh.wreckX + 22, sh.wreckX + 26, sh.X0 + 30, sh.X1 - 30, sh.wreckX - 30];
  vx.forEach((x, i) => {
    const z = i < 3 ? r.range(-1.6, -0.6) : r.range(-3, -10);
    const y = scen.heightAt(x, z) - 0.3, H = r.range(2.5, 5.5);
    const s = new Soup();
    // a lumpy stack of chimney segments
    const segs = 5;
    for (let k = 0; k < segs; k++) {
      const y0 = (k / segs) * H, y1 = ((k + 1) / segs) * H, r0 = 0.65 * (1 - k / segs * 0.6), r1 = 0.65 * (1 - (k + 1) / segs * 0.6);
      const from = s.count;
      s.lathe([[r0 * 1.2, y0], [r0, y0 + (y1 - y0) * 0.5], [r1 * 1.15, y1]], 7, reg, { jit: (j, kk) => 0.85 + hash2(j + k * 3, kk, i) * 0.35 });
      s.transformSince(from, mat4(Math.sin(k + i) * 0.12, 0, Math.cos(k * 2 + i) * 0.1, 1, 1, 1, k));
    }
    s.glow(3.2).lathe([[0.16, H - 0.05], [0.1, H + 0.08], [0, H + 0.1]], 6, throat);
    s.glow(0.8).lathe([[1.1, 0], [0.9, 0.25], [0, 0.3]], 7, reg);
    s.glow(0);
    scen.chunk(x).prop.append(s, mat4(x, y, z, 1, 1, 1, r.range(0, 6)));
    vents.push({ x, y: y + H, z, h: H });
    // tube worms crowd the warm base
    for (let k = 0; k < 4; k++) placeFloraAt(scen, 'tubeworms', x + r.range(-1.2, 1.2), scen.heightAt(x, z) - 0.05, z + r.range(-0.8, 0.8), r.range(0.9, 1.4));
    for (let k = 0; k < 2; k++) placeFloraAt(scen, 'bacteriaMat', x + r.range(-2, 2), scen.heightAt(x, z) - 0.02, z + r.range(-1, 1), r.range(1, 1.6));
  });
  // smoke plumes + shimmering heat
  scen.updaters.push((dt, camX) => {
    for (const v of vents) {
      if (Math.abs(v.x - camX) > 26) continue;
      if (Math.random() < dt * 9) w.fx.emit('ink', v.x + r.range(-0.1, 0.1), v.y, { n: 1, vy: 1.3, speed: 0.3, life: 3.5, size: 0.35, size1: 1.5, color: '#141018', alpha: 0.85, grav: 0.3, drag: 0.8, z: v.z });
      if (Math.random() < dt * 4) w.fx.emit('ember', v.x, v.y - 0.1, { n: 1, vy: 0.8, speed: 0.4, life: 1.2, size: 0.07, color: '#ffb050', z: v.z });
      // the plume pushes the blobfish up when it swims through
      const p = w.player;
      if (Math.abs(p.x - v.x) < 0.8 && p.y > v.y && p.y < v.y + 6 && Math.abs(v.z) < 2) p.vy += 9 * dt;
    }
  });
  // a whale fall: the skeleton of a great whale on the seabed, picked clean
  const wx = r.range(sh.X0 + 20, sh.wreckX - 14), wz = -7;
  const wy = scen.heightAt(wx, wz);
  const bone = scen.props.get('bone');
  const s = new Soup();
  const L = 14;
  for (let k = 0; k < 22; k++) {
    const t = k / 21, x = -L / 2 + t * L, rr = 0.22 * (1 - Math.abs(t - 0.35) * 0.9);
    const from = s.count; s.lathe([[rr, -0.12], [rr * 1.2, 0], [rr, 0.12]], 5, bone); s.transformSince(from, mat4(x, 0.5 + Math.sin(t * 3) * 0.2, 0, 1, 1, 1, 0, 0, Math.PI / 2));
    if (t > 0.25 && t < 0.62 && k % 2 === 0) for (const side of [-1, 1]) {
      const path: V3[] = [];
      for (let q = 0; q <= 4; q++) { const a = (q / 4) * Math.PI * 0.75; path.push([x, 0.5 + Math.cos(a) * 1.4 - 1.2 * (q / 4), side * Math.sin(a) * 1.5]); }
      s.tube(path, (u) => 0.07 * (1 - u * 0.5), 4, bone, { tip: true });
    }
  }
  // skull + jaw
  const from = s.count; s.lathe([[0.5, 0], [0.7, 0.5], [0.5, 1.6], [0.15, 2.4], [0, 2.6]], 6, bone, { sx: 1.2, sz: 0.8 }); s.transformSince(from, mat4(L / 2, 0.45, 0, 1, 1, 1, 0, 0, -Math.PI / 2 + 0.08));
  s.tube([[L / 2, 0.15, 0.6], [L / 2 + 2.5, 0.1, 0.4]], () => 0.08, 4, bone); s.tube([[L / 2, 0.15, -0.6], [L / 2 + 2.5, 0.1, -0.4]], () => 0.08, 4, bone);
  scen.chunk(wx).prop.append(s, mat4(wx, wy, wz, 1, 1, 1, r.range(-0.3, 0.3), 0, 0.03));
  for (let k = 0; k < 6; k++) placeFloraAt(scen, 'bacteriaMat', wx + r.range(-6, 6), scen.heightAt(wx, wz) - 0.02, wz + r.range(-1.5, 1.5), r.range(1, 2));
  // pillow lava mounds
  for (let i = 0; i < 10; i++) {
    const x = r.range(sh.X0, sh.X1), z = r.range(-3, -20);
    if (scen.isReserved(x, z, 1)) continue;
    const R = r.range(1.5, 3);
    scen.addRock(r.pick(scen.shapes('pillow')), x, scen.heightAt(x, z) - 0.3, z, R, R * 0.6, R, r.range(0, 6), { topK: 0.6 });
  }
  void group; void boulder; void crustPainter;
}
