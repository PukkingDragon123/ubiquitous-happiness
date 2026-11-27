// v8 WHALE SHARK loot (src/bosses/whaleShark.ts): the giant's hook (the rusted, line-trailing J you tore from its lip,
// gold-wrapped now: it's yours) and the trophy (a carved driftwood plaque of the spotted giant, gold lettering band).
import { mat, tube, torus, cone, cyl, ext, cbox, ball, type V2, type V3 } from './kit';
import { tx, PAL, pal } from './paint';
import { S } from './shared';
import type { Build } from './types';

export const WHALE_MODELS: Record<string, Build> = {
  giantsHook(b) {
    const Ru = tx('gHookRust', 32, 16, (p) => { p.metal(0, 0, 32, 16, PAL.iron, { b: 3 }); p.rust(8, 6, 5, 3); p.rust(22, 9, 4, 7); p.R(0, 0, 32, 2, PAL.steel, 4.5); for (let x = 2; x < 32; x += 9) p.scratch(x, 4, 5, PAL.steel); });
    const rust = mat('gHookRust', Ru, { rough: 0.55, metal: 0.4 });
    // the J: a long shank, a deep bend, the point and its barb
    const J: V3[] = [[0, 1.45, 0], [0, 0.6, 0], [0.02, -0.25, 0], [0.22, -0.72, 0], [0.62, -0.82, 0], [0.92, -0.5, 0], [0.92, 0.05, 0]];
    b.add(tube(J, (t) => 0.11 - t * 0.04, { radial: 6, segs: 20 }), rust);
    b.add(cone(0.12, 0.38, 5), S.point(), [0.92, 0.22, 0], [0, 0, 0]);
    b.add(cone(0.07, 0.3, 4), S.point(), [0.8, -0.02, 0], [0, 0, 2.5]);
    // the eye, gold-wrapped, with a twist of steel leader and a tuft of torn monofilament
    b.add(torus(0.16, 0.05, 5, 10), S.gold(), [0, 1.62, 0], [0, Math.PI / 2, 0]);
    for (let k = 0; k < 4; k++) b.add(torus(0.12, 0.03, 4, 8), S.gold(), [0, 1.3 - k * 0.09, 0], [Math.PI / 2, 0, 0]);
    b.add(tube([[0, 1.78, 0], [-0.25, 1.95, 0.05], [-0.55, 1.88, 0.08], [-0.75, 1.7, 0.02]], 0.022, { radial: 4, segs: 10 }), S.line());
    b.add(tube([[0, 1.78, 0], [-0.1, 2.0, -0.05], [-0.4, 2.1, -0.08]], 0.018, { radial: 4, segs: 8 }), S.line());
    // a scrap of ghost net still snagged on the bend, and a barnacle
    const Nt = tx('gHookNet', 16, 16, (p) => { p.all(PAL.teal, 2); for (let i = 0; i < 16; i += 4) { p.R(i, 0, 1, 16, PAL.teal, 4); p.R(0, i, 16, 1, PAL.teal, 4); } });
    b.add(ext([[0.1, -0.6], [0.5, -0.9], [0.7, -0.6], [0.35, -0.4]] as V2[], 0.04, 0.01), mat('gHookNet', Nt, { rough: 0.9 }), [0, 0, 0.08]);
    b.add(cone(0.09, 0.09, 6), S.barnacle(), [0.15, -0.55, 0.1], [Math.PI / 2, 0, 0]);
    b.add(ball(0.06, 6, 4), S.gold(), [0.62, -0.84, 0.08]);
  },
  whaleTrophy(b) {
    // a driftwood shield plaque, a carved whale shark across it in dark-blue paint with white spots, a gold name band
    const Wd = tx('wTrophyWood', 64, 48, (p) => { p.wood(0, 0, 64, 48, PAL.oak, { seed: 21, knots: 2, lines: 5 }); p.R(0, 0, 64, 2, PAL.oak, 4.5); p.R(0, 46, 64, 2, PAL.oak, 1); });
    const wood = mat('wTrophyWood', Wd, { rough: 0.8 });
    const shield: V2[] = [[-1.0, 0.85], [1.0, 0.85], [1.0, -0.35], [0.6, -0.8], [0, -0.98], [-0.6, -0.8], [-1.0, -0.35]];
    b.add(ext(shield, 0.16, 0.05), wood, [0, 0, -0.1]);
    const Sk = tx('wTrophySkin', 48, 16, (p) => { p.all(PAL.navy, 3); p.R(0, 10, 48, 6, pal('#e8e6dc'), 3.5); for (let x = 3; x < 48; x += 6) for (let y = 2; y < 10; y += 4) { p.t(x + ((y >> 2) & 1) * 2, y, pal('#f4f2ea'), 4); p.t(x + 1 + ((y >> 2) & 1) * 2, y, pal('#f4f2ea'), 4); } for (let x = 0; x < 48; x += 6) p.R(x, 0, 1, 10, PAL.navy, 4.5); });
    const skin = mat('wTrophySkin', Sk, { rough: 0.85 });
    // the fish: a flattened lathe-ish body (a tapered tube), a tall tail, a dorsal, a broad flat head
    const body: V3[] = [[0.72, 0.12, 0.08], [0.4, 0.14, 0.1], [0.0, 0.12, 0.1], [-0.4, 0.1, 0.08], [-0.66, 0.1, 0.06]];
    b.add(tube(body, (t) => 0.2 * (1 - t * 0.7) + (t < 0.1 ? -0.04 : 0), { radial: 6, segs: 14, sx: 0.55 }), skin);
    b.add(ext([[-0.62, 0.1], [-0.92, 0.52], [-0.86, 0.12], [-0.92, -0.18]] as V2[], 0.05, 0.015), skin, [0, 0, 0.06]);
    b.add(ext([[-0.05, 0.28], [0.12, 0.28], [-0.12, 0.5]] as V2[], 0.04, 0.01), skin, [0, 0, 0.08]);
    b.add(ext([[0.25, -0.02], [0.45, -0.05], [0.12, -0.28]] as V2[], 0.04, 0.01), skin, [0, 0, 0.14]);
    b.add(ball(0.025, 5, 4), mat('wTrophyEye', null, { color: '#101418', rough: 0.4 }), [0.66, 0.15, 0.17]);
    // the gold name band and corner pins (legendary)
    b.add(cbox(1.3, 0.24, 0.06, 0.03), S.gold(), [0, -0.5, 0.06]);
    for (const [x, y] of [[-0.82, 0.68], [0.82, 0.68], [0, -0.82]] as V2[]) b.add(cyl(0.06, 0.05, 6), S.brassPin(), [x, y, 0.07], [Math.PI / 2, 0, 0]);
    b.add(cone(0.05, 0.08, 5), S.gold(), [0, -0.5, 0.12], [Math.PI / 2, 0, 0]);
  },
};
