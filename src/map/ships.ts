// Vessels for the diorama, all built along +x (bow) with the waterline at y = 0: open rowboats / dinghies /
// canoes with anglers, sailboats, fishing boats, trawlers with net booms, and the three act bosses' ships.
import { Loft, V3 } from '../gfx/loft';
import { Rng } from '../core/rng';
import { A } from './tex';
import { angler, box, hull, lathe, membrane, place, rod, blob, barrel, crate, surf, bunting, PersonOpts } from './build';

export type ShipKind = 'rowboat' | 'dinghy' | 'canoe' | 'sailboat' | 'fishing' | 'trawler' | 'boss1' | 'boss2' | 'boss3';
export interface ShipOut { tips: V3[]; lamps: V3[]; beams: { at: V3; dir: number }[]; len: number }

const person = (r: Rng, o: PersonOpts = {}): PersonOpts => ({
  skin: r.int(0, 3), shirt: r.int(0, 3), pants: r.int(0, 3), hat: r.int(0, 3),
  hatKind: r.pick(['bucket', 'cap', 'beanie', 'bucket'] as const), beard: r.chance(0.3), ...o,
});

/** build a vessel into L at the origin; returns rod tips etc. in local space */
export function ship(L: Loft, kind: ShipKind, seed: number, o: { anglers?: number; paint?: number; pro?: boolean } = {}): ShipOut {
  const r = new Rng(seed);
  const out: ShipOut = { tips: [], lamps: [], beams: [], len: 1 };
  const paint = A.hull[o.paint ?? r.int(0, 4)];
  const crew = (n: number, xs: number[], y: number, sit: boolean, faceOut = true) => {
    for (let i = 0; i < n; i++) {
      const from = L.count;
      const side = i % 2 ? -1 : 1;
      const tip = angler(L, person(r, { sit, s: 1, rodLen: r.range(0.55, 0.8), hatKind: o.pro ? 'captain' : undefined }));
      const rot = faceOut ? side * (Math.PI / 2) + r.range(-0.35, 0.35) : r.range(-0.4, 0.4);
      const pos: V3 = [xs[i % xs.length], y, side * 0.02];
      place(L, from, pos, rot);
      const c = Math.cos(rot), s = Math.sin(rot);
      out.tips.push([pos[0] + tip[0] * c + tip[2] * s, pos[1] + tip[1], pos[2] - tip[0] * s + tip[2] * c]);
    }
  };
  switch (kind) {
    case 'rowboat': case 'dinghy': {
      const len = kind === 'rowboat' ? 1.05 : 0.8;
      out.len = len;
      const from = L.count;
      hull(L, { len, beam: len * 0.42, depth: 0.2, paint, open: true, bowRise: 0.07, transom: kind === 'dinghy' ? 0.85 : 0.62 });
      place(L, from, [0, 0.07, 0]);
      // oars resting in the locks
      for (const s of [-1, 1]) rod(L, [0.05, 0.1, s * 0.2], [-0.3, 0.0, s * 0.42], 0.007, 0.007, 4, A.darkWood);
      const n = Math.max(1, Math.min(2, o.anglers ?? 1));
      crew(n, n === 1 ? [-0.12] : [-0.25, 0.12], 0.0, true);
      if (r.chance(0.6)) crate(L, [0.25, -0.02, 0], 0.07, 0.4);
      if (kind === 'dinghy') {
        // dive flag
        rod(L, [-len * 0.42, 0.05, 0.1], [-len * 0.42, 0.55, 0.1], 0.006, 0.005, 4, A.white);
        membrane(L, [[[-len * 0.42, 0.54, 0.1], [-len * 0.42 - 0.2, 0.54, 0.1]], [[-len * 0.42, 0.42, 0.1], [-len * 0.42 - 0.2, 0.42, 0.1]]], A.redPaint);
      }
      break;
    }
    case 'canoe': {
      out.len = 1.15;
      const from = L.count;
      hull(L, { len: 1.15, beam: 0.3, depth: 0.15, paint: A.hull[r.chance(0.5) ? 3 : 4], open: true, pointed: true, bowRise: 0.06 });
      place(L, from, [0, 0.06, 0]);
      rod(L, [0.25, 0.05, 0.05], [0.55, 0.2, 0.18], 0.006, 0.006, 4, A.darkWood);
      box(L, [0.57, 0.21, 0.19], [0.06, 0.006, 0.04], A.darkWood);
      crew(1, [-0.15], 0.0, true);
      break;
    }
    case 'sailboat': {
      out.len = 1.3;
      const from = L.count;
      hull(L, { len: 1.3, beam: 0.48, depth: 0.22, paint, bowRise: 0.08, transom: 0.7 });
      place(L, from, [0, 0.08, 0]);
      box(L, [-0.15, 0.12, 0], [0.32, 0.08, 0.26], A.cabin);
      box(L, [-0.15, 0.165, 0], [0.34, 0.012, 0.28], A.white);
      rod(L, [0.12, 0.08, 0], [0.12, 1.25, 0], 0.012, 0.008, 5, A.white);
      rod(L, [0.12, 0.22, 0], [-0.5, 0.2, 0], 0.008, 0.008, 4, A.darkWood);
      // mainsail + jib (gently bellied)
      const belly = (t: number, k: number) => Math.sin(t * Math.PI) * k;
      const main: V3[][] = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j): V3 => { const u = j / 3, v = i / 3; return [0.11 - u * 0.6 * (1 - v * 0.95), 0.24 + v * 0.98, belly(u, 0.07) * (1 - v)]; }));
      membrane(L, main, A.sail);
      const jib: V3[][] = [0, 1, 2].map((i) => [0, 1, 2].map((j): V3 => { const u = j / 2, v = i / 2; return [0.13 + u * 0.48 * (1 - v), 0.16 + v * 0.95 * (1 - u * 0.15), belly(u, 0.05) * (1 - v)]; }));
      membrane(L, jib, A.sail);
      rod(L, [0.12, 1.2, 0], [0.62, 0.14, 0], 0.003, 0.003, 3, A.rope, false);
      if (o.anglers) crew(1, [-0.42], 0.08, true);
      out.lamps.push([0.12, 1.26, 0]);
      break;
    }
    case 'fishing': {
      out.len = 1.5;
      const from = L.count;
      hull(L, { len: 1.5, beam: 0.55, depth: 0.26, paint, bowRise: 0.1, transom: 0.75 });
      place(L, from, [0, 0.09, 0]);
      box(L, [0.1, 0.24, 0], [0.38, 0.3, 0.36], A.cabin);
      box(L, [0.1, 0.4, 0], [0.44, 0.03, 0.42], A.redPaint);
      rod(L, [0.0, 0.4, 0], [0.0, 0.95, 0], 0.012, 0.009, 5, A.white);
      rod(L, [0.0, 0.8, 0], [-0.45, 0.35, 0], 0.008, 0.008, 4, A.metal);
      lathe(L, [[0.03, 0.42], [0.04, 0.47], [0.0, 0.5]], 6, A.lamp, { capBot: true });
      out.lamps.push([0.1, 0.48, 0]);
      for (let k = 0; k < 3; k++) barrel(L, [-0.45 + k * 0.1, 0.09, 0.18], 0.035, 0.08);
      crate(L, [-0.5, 0.09, -0.12], 0.08, 0.3);
      crew(Math.max(1, Math.min(2, o.anglers ?? 1)), [-0.3, -0.55], 0.09, false);
      break;
    }
    case 'trawler': {
      out.len = 2.0;
      const from = L.count;
      hull(L, { len: 2.0, beam: 0.72, depth: 0.32, paint: A.hull[o.paint ?? r.pick([0, 1, 3, 5])], bowRise: 0.12, transom: 0.8 });
      place(L, from, [0, 0.1, 0]);
      box(L, [0.35, 0.3, 0], [0.5, 0.38, 0.5], A.cabin);
      box(L, [0.35, 0.52, 0], [0.56, 0.04, 0.56], A.bluePaint);
      box(L, [0.4, 0.6, 0], [0.3, 0.14, 0.36], A.cabin);
      box(L, [0.4, 0.68, 0], [0.34, 0.02, 0.4], A.redPaint);
      rod(L, [0.0, 0.1, 0], [0.0, 1.35, 0], 0.016, 0.012, 6, A.metal);
      lathe(L, [[0.05, 0.86], [0.05, 0.92], [0.0, 0.94]], 6, A.lamp, { capBot: true });
      out.lamps.push([0.4, 0.75, 0], [0.0, 1.36, 0]);
      // outrigger booms + hanging nets
      for (const s of [-1, 1]) {
        const tip: V3 = [-0.05, 0.75, s * 1.0];
        rod(L, [0.0, 1.05, 0], tip, 0.01, 0.008, 4, A.metal);
        rod(L, [0.0, 0.3, s * 0.3], tip, 0.004, 0.004, 3, A.rope, false);
        out.tips.push(tip);
      }
      // the stern gantry with a net drum
      for (const s of [-1, 1]) rod(L, [-0.85, 0.1, s * 0.28], [-0.85, 0.6, s * 0.28], 0.012, 0.012, 4, A.yellow);
      rod(L, [-0.85, 0.6, -0.3], [-0.85, 0.6, 0.3], 0.012, 0.012, 4, A.yellow);
      rod(L, [-0.7, 0.2, -0.22], [-0.7, 0.2, 0.22], 0.07, 0.07, 10, A.net);
      for (let k = 0; k < 4; k++) crate(L, [-0.35 - (k % 2) * 0.12, 0.1, -0.15 + Math.floor(k / 2) * 0.28], 0.1, k);
      crew(Math.max(1, Math.min(2, o.anglers ?? 1)), [-0.4, 0.8], 0.1, false);
      break;
    }
    case 'boss1': {
      // The Reel King: a gleaming white-and-gold yacht with a golden mega-rod on the stern
      out.len = 4.2;
      const from = L.count;
      hull(L, { len: 4.2, beam: 1.35, depth: 0.55, paint: A.hull[2], bowRise: 0.2, transom: 0.8, deck: A.deck });
      place(L, from, [0, 0.2, 0]);
      box(L, [0.3, 0.42, 0], [1.9, 0.44, 1.0], A.cabin);
      box(L, [0.3, 0.66, 0], [2.1, 0.05, 1.12], A.gold);
      box(L, [0.5, 0.86, 0], [1.2, 0.36, 0.8], A.cabin);
      box(L, [0.5, 1.06, 0], [1.35, 0.05, 0.92], A.gold);
      box(L, [0.6, 1.24, 0], [0.6, 0.3, 0.5], A.glass);
      box(L, [0.6, 1.4, 0], [0.7, 0.04, 0.6], A.gold);
      rod(L, [0.6, 1.4, 0], [0.6, 2.3, 0], 0.025, 0.015, 6, A.gold);
      lathe(L, [[0.06, 2.28], [0.06, 2.36], [0.0, 2.4]], 8, A.lamp, { capBot: true });
      out.lamps.push([0.6, 2.36, 0]);
      for (let k = 0; k < 6; k++) out.lamps.push([-0.5 + k * 0.32, 0.5, 0.52]);
      // golden mega rod + throne
      rod(L, [-1.7, 0.25, 0], [-3.4, 2.8, 0.4], 0.04, 0.012, 6, A.gold);
      box(L, [-1.55, 0.45, 0], [0.3, 0.5, 0.36], A.redPaint);
      box(L, [-1.45, 0.3, 0], [0.4, 0.12, 0.42], A.gold);
      out.tips.push([-3.4, 2.8, 0.4]);
      const fk = L.count;
      angler(L, { skin: 0, shirt: 2, pants: 0, hat: 0, hatKind: 'captain', beard: true, rod: false, s: 2.2, sit: true });
      place(L, fk, [-1.6, 0.4, 0], 0);
      blob(L, [-1.32, 1.15, 0], 0.07, 0.05, 0.12, A.gold, 8);
      bunting(L, [1.9, 0.5, 0], [0.6, 2.2, 0], 10, seed);
      bunting(L, [0.6, 2.2, 0], [-1.9, 0.6, 0], 12, seed + 1);
      break;
    }
    case 'boss2': {
      // Captain Frostbeard's icebreaker: red hull, black boot-top, white superstructure, harpoon crane
      out.len = 4.4;
      const from = L.count;
      hull(L, { len: 4.4, beam: 1.4, depth: 0.6, paint: A.hull[0], bowRise: 0.14, transom: 0.85 });
      place(L, from, [0, 0.22, 0]);
      box(L, [0.6, 0.52, 0], [1.4, 0.6, 1.1], A.cabin);
      box(L, [0.7, 0.98, 0], [1.0, 0.34, 0.9], A.cabin);
      box(L, [0.7, 1.17, 0], [1.1, 0.04, 1.0], A.redPaint);
      lathe(L, [[0.18, 1.0], [0.16, 1.5], [0.17, 1.55]], 10, A.redPaint);
      lathe(L, [[0.17, 1.55], [0.17, 1.62]], 10, A.black);
      out.lamps.push([1.25, 1.05, 0.46], [1.25, 1.05, -0.46], [0.7, 1.2, 0]);
      rod(L, [-0.8, 0.22, 0], [-0.8, 1.6, 0], 0.035, 0.03, 6, A.yellow);
      rod(L, [-0.8, 1.5, 0], [-2.2, 1.1, 0.5], 0.03, 0.02, 6, A.yellow);
      rod(L, [-2.2, 1.1, 0.5], [-2.25, 0.0, 0.6], 0.006, 0.006, 3, A.rope, false);
      out.tips.push([-2.2, 1.1, 0.5]);
      for (let k = 0; k < 6; k++) barrel(L, [-1.4 + (k % 3) * 0.2, 0.22, -0.3 + Math.floor(k / 3) * 0.25], 0.06, 0.14);
      const fk = L.count;
      angler(L, { skin: 2, shirt: 1, pants: 0, hat: 3, hatKind: 'beanie', beard: true, rod: false, s: 2.0 });
      place(L, fk, [1.6, 0.22, 0], 0);
      out.beams.push({ at: [1.25, 1.2, 0], dir: 0 });
      break;
    }
    case 'boss3': {
      // The Leviathan factory trawler: a dark iron monster bristling with lights and nets
      out.len = 5.2;
      const from = L.count;
      hull(L, { len: 5.2, beam: 1.6, depth: 0.7, paint: A.hull[5], bowRise: 0.16, transom: 0.85, deck: A.hullDark });
      place(L, from, [0, 0.26, 0]);
      box(L, [1.2, 0.7, 0], [1.4, 0.9, 1.3], A.rust);
      box(L, [1.3, 1.3, 0], [1.0, 0.36, 1.1], A.cabin);
      box(L, [1.3, 1.5, 0], [1.1, 0.05, 1.2], A.black);
      for (let k = 0; k < 2; k++) { const f = L.count; lathe(L, [[0.16, 0], [0.14, 0.85], [0.16, 0.9]], 10, k ? A.rust : A.metal); place(L, f, [0.95 + k * 0.5, 1.15, 0]); }
      rod(L, [0.2, 0.26, 0], [0.2, 2.6, 0], 0.04, 0.03, 6, A.metal);
      for (const s of [-1, 1]) {
        const tip: V3 = [-0.8, 1.6, s * 1.9];
        rod(L, [0.2, 2.2, 0], tip, 0.03, 0.02, 5, A.rust);
        rod(L, tip, [-0.9, 0.0, s * 2.0], 0.005, 0.005, 3, A.rope, false);
        out.tips.push(tip);
      }
      for (let k = 0; k < 3; k++) rod(L, [-2.2 + k * 0.1, 0.26, -0.7], [-2.2 + k * 0.1, 1.3, -0.7], 0.03, 0.03, 4, A.yellow);
      rod(L, [-2.0, 0.6, -0.6], [-2.0, 0.6, 0.6], 0.2, 0.2, 12, A.net);
      for (let k = 0; k < 10; k++) out.lamps.push([-2.2 + k * 0.45, 0.62, 0.8 * (k % 2 ? 1 : -1)]);
      out.lamps.push([1.3, 1.55, 0], [0.2, 2.62, 0]);
      out.beams.push({ at: [1.9, 1.3, 0.4], dir: 0.4 }, { at: [1.9, 1.3, -0.4], dir: -0.4 }, { at: [0.2, 2.5, 0], dir: Math.PI });
      surf(L, [[[-2.6, 0.27, -0.6], [-2.6, 0.27, 0.6]], [[-3.3, -0.5, -0.8], [-3.3, -0.5, 0.8]]], (i, j) => [j, i], A.net, () => [-0.5, 1, 0]);
      break;
    }
  }
  return out;
}
