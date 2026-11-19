// Shared small-part materials (line, wire, chrome, brass, rope, thread, lead...): one painted page each, built on first
// use, so every model that ties on a bit of line or a brass pin draws it the same way (and in the same draw call).
import { mat } from './kit';
import { tx, PAL, pal } from './paint';

const once = <T>(f: () => T) => { let v: T | undefined; return () => (v ??= f()); };

export const S = {
  /** pale teal monofilament */
  line: once(() => mat('s:line', tx('s:line', 32, 8, (p) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) { const k = (x + y * 2) % 6; p.t(x, y, PAL.teal, k < 2 ? 4.5 : k < 4 ? 3.5 : 3); }
    p.R(0, 0, 32, 1, PAL.teal, 5);
  }), { rough: 0.3, emissive: '#1a6a5a', ek: 0.3 })),
  /** red whipping thread */
  thread: once(() => mat('s:thread', tx('s:thread', 16, 8, (p) => p.rope(0, 0, 16, 8, PAL.red, { pitch: 3 })), { rough: 0.8 })),
  /** bright steel wire / rings */
  wire: once(() => mat('s:wire', tx('s:wire', 8, 8, (p) => { p.all(PAL.steel, 3.5); p.R(0, 0, 8, 2, PAL.steel, 5); p.R(0, 6, 8, 2, PAL.steel, 2); }), { rough: 0.3, metal: 0.7 })),
  /** chrome hardware (latches, rings, guides) */
  chrome: once(() => mat('s:chrome', tx('s:chrome', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.silver, { b: 3.5 }); p.panel(0, 0, 16, 16, PAL.silver, 3.5, { noFill: true }); p.glint(4, 4, 1); }), { rough: 0.25, metal: 0.7 })),
  /** polished brass (small fittings, bands) */
  brass: once(() => mat('s:brass', tx('s:brass', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.brass, { b: 3.5 }); p.panel(0, 0, 16, 16, PAL.brass, 3.5, { noFill: true }); p.R(2, 2, 3, 2, PAL.brass, 5); }), { rough: 0.3, metal: 0.62 })),
  /** a domed brass pin / screw head */
  brassPin: once(() => mat('s:brassPin', tx('s:brassPin', 16, 16, (p) => { p.all(PAL.brass, 3); p.dome(8, 8, 7, 7, PAL.brass, 3); p.R(4, 7, 8, 2, PAL.brass, 1); p.glint(5, 4, 1); }), { rough: 0.3, metal: 0.6 })),
  /** legendary gold trim */
  gold: once(() => mat('s:gold', tx('s:gold', 16, 16, (p) => { p.metal(0, 0, 16, 16, PAL.gold, { b: 3.5 }); p.panel(0, 0, 16, 16, PAL.gold, 3.5, { noFill: true }); p.glint(4, 4, 1); }), { rough: 0.25, metal: 0.7, emissive: '#7a4006', ek: 0.25 })),
  /** dark worked iron (shafts, sockets) */
  iron: once(() => mat('s:iron', tx('s:iron', 32, 16, (p) => { p.metal(0, 0, 32, 16, PAL.iron, { b: 3 }); p.rust(8, 8, 3, 2); p.R(0, 0, 32, 1, PAL.iron, 5); }), { rough: 0.55, metal: 0.45 })),
  /** the bright honed point of a hook or prong */
  point: once(() => mat('s:point', tx('s:point', 8, 8, (p) => { p.all(PAL.steel, 3.5); p.R(0, 0, 8, 2, PAL.steel, 5); p.R(0, 6, 8, 2, PAL.steel, 2); p.glint(3, 3, 1); }), { rough: 0.3, metal: 0.6 })),
  /** hemp rope */
  rope: once(() => mat('s:rope', tx('s:rope', 32, 8, (p) => p.rope(0, 0, 32, 8, pal('#b8925a'))), { rough: 0.95 })),
  /** pale twine */
  twine: once(() => mat('s:twine', tx('s:twine', 32, 8, (p) => p.rope(0, 0, 32, 8, pal('#c8a46a'))), { rough: 0.9 })),
  /** dull lead */
  lead: once(() => mat('s:lead', tx('s:lead', 32, 32, (p) => {
    p.all(PAL.lead, 3.5);
    for (let y = 0; y < 32; y += 6) p.R(0, y, 32, 1, PAL.lead, 3);
    p.R(0, 0, 32, 4, PAL.lead, 4.5); p.R(0, 26, 32, 6, PAL.lead, 2.5);
    for (const [x, y] of [[8, 12], [11, 12], [22, 18], [25, 18]]) { p.t(x, y, PAL.lead, 1); p.t(x, y + 1, PAL.lead, 5); }
    p.scratch(4, 8, 7, PAL.lead, 0.25); p.scratch(18, 24, 6, PAL.lead, -0.2);
    p.R(5, 5, 4, 2, PAL.lead, 5);
  }), { rough: 0.5, metal: 0.35 })),
  /** black rubber */
  rubber: once(() => mat('s:rubber', tx('s:rubber', 32, 8, (p) => { p.all(PAL.black, 3); for (let x = 0; x < 32; x += 3) p.R(x, 0, 1, 8, PAL.black, 1); p.R(0, 1, 32, 1, PAL.black, 5); }), { rough: 0.7 })),
  /** dark brown leather strap */
  strap: once(() => mat('s:strap', tx('s:strap', 32, 8, (p) => { p.all(PAL.leather, 3); p.R(0, 0, 32, 1, PAL.leather, 4.5); p.R(0, 7, 32, 1, PAL.leather, 1); p.stitch(0, 2, 31, 2, '#e8c890', '#2a1408'); p.stitch(0, 5, 31, 5, '#e8c890', '#2a1408'); }), { rough: 0.7 })),
  /** a matte black void (openings, holes, insides) */
  dark: once(() => mat('s:dark', tx('s:dark', 8, 8, (p) => { p.all(PAL.ink, 0.5); p.R(0, 0, 8, 1, PAL.ink, 1.5); }), { rough: 1 })),
  /** polished bone / ivory */
  bone: once(() => mat('s:bone', tx('s:bone', 16, 8, (p) => { p.all(PAL.bone, 4); p.R(0, 0, 16, 2, PAL.bone, 5); p.R(0, 6, 16, 2, PAL.bone, 3); for (let x = 2; x < 16; x += 5) p.R(x, 3, 2, 2, PAL.bone, 2.5); }), { rough: 0.5 })),
  /** barnacle crust (white cones with a dark mouth) */
  barnacle: once(() => mat('s:barnacle', tx('s:barnacle', 16, 16, (p) => { p.all(PAL.bone, 4); p.ellipse(8, 8, 4, 4, '#2c2a34'); p.R(0, 0, 16, 3, PAL.bone, 5); }), { rough: 0.9 })),
  /** red fire coral */
  coral: once(() => mat('s:coral', tx('s:coral', 32, 16, (p) => {
    p.all(PAL.coral, 3);
    for (let y = 1; y < 16; y += 4) for (let x = (y % 8 === 1 ? 0 : 2); x < 32; x += 4) { p.t(x, y, PAL.coral, 5); p.t(x + 1, y, PAL.coral, 4); p.t(x, y + 1, PAL.coral, 4); p.t(x + 1, y + 1, PAL.coral, 1); }
    p.R(26, 0, 6, 16, PAL.coral, 4); p.R(0, 0, 3, 16, PAL.coral, 2);
  }), { rough: 0.7 })),
  /** a glowing coral tip */
  coralTip: once(() => mat('s:coralTip', tx('s:coralTip', 8, 8, (p) => { p.all(PAL.yellow, 4); p.R(0, 5, 8, 3, PAL.coral, 4); p.R(1, 1, 2, 2, PAL.yellow, 5); }), { rough: 0.5, emissive: '#a03a10', ek: 0.35 })),
  /** a small pearl */
  pearl: once(() => mat('s:pearl', tx('s:pearl', 16, 16, (p) => { p.all(PAL.pearl, 3.5); p.R(0, 4, 16, 2, PAL.pink, 4.5); p.R(0, 11, 16, 2, PAL.nacre, 4); p.R(0, 13, 16, 3, PAL.pearl, 2.5); p.R(3, 2, 3, 2, PAL.pearl, 5); }), { rough: 0.2, metal: 0.1, emissive: '#4a3a5a', ek: 0.35 })),
  /** rarity accents: a cut amethyst (epic) and a cut sapphire (rare) */
  amethyst: once(() => mat('s:amethyst', tx('s:amethyst', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.amethyst, 6)), { rough: 0.1, metal: 0.1, emissive: '#8236c0', ek: 0.8 })),
  sapphire: once(() => mat('s:sapphire', tx('s:sapphire', 16, 16, (p) => p.facets(0, 0, 16, 16, PAL.blue, 6)), { rough: 0.1, metal: 0.1, emissive: '#2c62c4', ek: 0.7 })),
  /** clear glass (bottles, jars, lenses) */
  glass: once(() => mat('s:glass', tx('s:glass', 16, 16, (p) => { p.all(PAL.glass, 4); p.R(2, 2, 3, 12, PAL.glass, 5); p.R(11, 1, 2, 14, PAL.glass, 3); }), { rough: 0.1, metal: 0.1, opacity: 0.45, emissive: '#3a8a7a', ek: 0.2 })),
};
