// v8 icon designs (painted fallbacks, 32 px per cell) for the hermit crab and sea slug loot: the same hand-placed
// style as iconArt.ts (cel-shaded ramps, top-left light, selective outline, a glint or two). The pack normally shows
// the photographed 3D model (src/backpack/models/critters.ts); these draw when no GL context is around.
import { bez, bez3, curve, type V2 } from './pix';
import { R } from './ramps';
import type { IconDesign } from './iconArt';

/** a little spiral whelk (spire top right, mouth bottom left) */
function whelk(p: Parameters<IconDesign['draw']>[0], cx: number, cy: number, k: number, band: typeof R.orange) {
  p.poly([[cx - 11 * k, cy + 7 * k], [cx - 6 * k, cy - 4 * k], [cx + 4 * k, cy - 10 * k], [cx + 12 * k, cy - 13 * k], [cx + 9 * k, cy - 4 * k], [cx + 3 * k, cy + 6 * k], [cx - 5 * k, cy + 10 * k]], R.cream, { shade: 'round', spec: true });
  for (let i = 0; i < 4; i++) {
    const t = i / 4, x = cx - 6 * k + t * 16 * k, y = cy + 4 * k - t * 15 * k;
    p.line([[x - 4 * k * (1 - t), y - 2 * k], [x + 3 * k * (1 - t), y + 3 * k]], -2);
    p.stroke([[x - 3 * k * (1 - t), y], [x + 2 * k * (1 - t), y + 2.5 * k]], 0.9 * k, band, { tone: 3 });
  }
  p.ellipse(cx - 7 * k, cy + 6 * k, 4.5 * k, 3 * k, R.pink, { rot: -0.6, shade: 'round' });
  p.ellipse(cx - 7.5 * k, cy + 6.5 * k, 2.4 * k, 1.4 * k, R.pink, { rot: -0.6, shade: 'facet', tone: 1, edge: false });
}

export const CRITTER_ICONS: Record<string, IconDesign> = {
  recipeScroll: { draw(p) {
    // a rolled kelp-paper scroll lying diagonally, its tongue unrolled with ink on it, a red claw-print seal
    p.poly([[13, 14], [27, 18], [25, 27], [10, 23]], R.paper, { shade: 'flat' });
    p.line([[14, 18], [23, 21]], '#33215a'); p.line([[13, 21], [21, 23]], '#33215a');
    p.stroke([[5, 23], [22, 6]], 4.6, R.paper, { caps: true });
    p.ellipse(4, 24, 2.6, 4, R.paper, { rot: 0.8, shade: 'facet', tone: 2 });
    p.ellipse(4, 24, 1.2, 2, R.paper, { rot: 0.8, shade: 'facet', tone: 1, edge: false });
    p.stroke([[11, 12], [15, 16]], 1.2, R.rope, { tone: 3 });
    p.circle(15, 15, 3.8, R.red, { spec: true });
    p.line([[13, 17], [14, 13], [17, 14], [16, 17]], -2);
    p.glint(19, 8);
  } },

  spareShell: { draw(p) { whelk(p, 15, 17, 1, R.orange); p.glint(22, 6); } },

  shellArmor: { size: [2, 2], draw(p) {
    // a leather back-plate: a moon snail boss flanked by two whelks, kelp lacing, brass buckles on the straps
    p.poly([[6, 14], [18, 8], [46, 8], [58, 14], [58, 38], [48, 54], [32, 60], [16, 54], [6, 38]], R.leather, { shade: 'flat', bevel: 2 });
    for (const x of [14, 50]) { p.rect(x - 3, 2, 6, 10, R.leather, { r: 1 }); p.ring(x, 4, 2.6, 1.2, R.brass); }
    p.line([[10, 16], [54, 16]], -1); p.line([[10, 50], [54, 50]], -1);
    for (let x = 12; x < 54; x += 4) { p.px(x, 18, '#e8d4a0'); p.px(x + 1, 48, '#e8d4a0'); }
    p.circle(32, 33, 13, R.cream, { spec: true });
    p.line(curve((t) => { const a = t * Math.PI * 3.2 + 0.4; const r = 1 + t * 11; return [32 + Math.cos(a) * r, 33 + Math.sin(a) * r]; }, 50), -2);
    p.ellipse(39, 41, 3, 2, R.violet, { shade: 'round' });
    whelk(p, 14, 34, 0.62, R.orange);
    whelk(p, 51, 34, 0.62, R.coral);
    for (const s of [-1, 1]) p.stroke(bez([32 + s * 8, 22], [32 + s * 12, 26], [32 + s * 16, 24], 8), 1, R.kelp);
  } },

  slugInk: { draw(p) {
    // a violet puffer skin full of ink: orange-rimmed spots, little spines, a cork and a lit fuse
    p.circle(15, 18, 10.5, R.violet, { spec: true });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + 0.3; p.poly([[15 + Math.cos(a) * 9.5, 18 + Math.sin(a) * 9.5], [15 + Math.cos(a - 0.12) * 9.5, 18 + Math.sin(a - 0.12) * 9.5], [15 + Math.cos(a - 0.06) * 13, 18 + Math.sin(a - 0.06) * 13]], R.orange, { shade: 'facet', tone: 4 }); }
    for (const [x, y] of [[10, 15], [17, 12], [20, 20], [12, 22], [16, 18]] as V2[]) { p.circle(x, y, 1.8, R.orange, { shade: 'facet', tone: 3, edge: false }); p.px(x, y, '#ffffff'); }
    p.rect(13, 5, 5, 4, R.cork, { r: 1 });
    p.stroke(bez3([15, 5], [17, 1], [22, 3], [25, 2], 10), 0.7, R.rope);
    p.glint(26, 2, 1, '#ffffff', '#ffe060');
    p.ellipse(7, 28, 1.6, 2.2, R.violet, { spec: true });
  } },

  pearlPouch: { draw(p) {
    p.ellipse(14, 20, 10, 9, R.kelp, { spec: false });
    p.poly([[8, 12], [20, 12], [23, 6], [18, 9], [14, 5], [10, 9], [5, 6]], R.kelp, { shade: 'round' });
    p.rect(8, 11, 13, 3, R.rope, { r: 1, shade: 'round' });
    p.line([[9, 18], [11, 26]], -1); p.line([[19, 17], [18, 26]], -1);
    for (const [x, y, r] of [[24, 12, 3.4], [27, 19, 3], [24, 26, 3.2], [19, 4, 2.6]] as [number, number, number][]) { p.circle(x, y, r, R.pearl, { spec: true }); p.px(x - 1, y - 1, '#ffffff'); }
  } },

  bunnyCharm: { draw(p) {
    // a fluffy sea bunny: a cream dome with black specks, two black-tipped ears, a white gill tail, a twine loop
    p.ring(16, 4, 3, 1, R.rope);
    p.ellipse(15, 20, 12, 8, R.cream, { spec: true });
    for (const s of [-1, 1]) {
      p.stroke([[20 + s * 2, 14], [21 + s * 3.5, 6]], 2.2, R.cream);
      p.stroke([[21 + s * 3.2, 8], [21.5 + s * 3.6, 5]], 2.3, R.black);
    }
    p.star(4, 18, 2, 4.5, 5, R.white, { rot: -0.3 });
    for (const [x, y] of [[9, 18], [14, 15], [18, 21], [12, 23], [22, 18]] as V2[]) p.px(x, y, '#1a1408');
    for (let x = 6; x < 25; x += 3) p.px(x, 13 + ((x / 3) % 2), '#ffffff');
    p.line([[5, 26], [25, 26]], -1);
  } },

  nudiBait: { draw(p) {
    // a J hook through a blue-and-orange nudibranch lure
    p.stroke([[16, 4], [16, 22]], 0.9, R.steel);
    p.stroke(bez3([16, 22], [16, 30], [8, 30], [7, 23], 12), 0.9, R.steel);
    p.poly([[7, 23], [5, 25], [8, 21]], R.steel, { shade: 'facet', tone: 4 });
    p.ring(16, 3, 2, 0.8, R.steel);
    p.ellipse(16, 15, 12, 4.2, R.violet, { spec: true });
    p.line([[6, 14], [26, 14]], '#12121c');
    p.stroke([[5, 18], [27, 18]], 0.7, R.yellow, { tone: 4 });
    for (const x of [23, 26]) p.stroke([[x, 12], [x + 1, 6]], 1.1, R.orange);
    for (let i = 0; i < 4; i++) p.stroke([[7, 12], [4 + i * 1.6, 7 + (i % 2)]], 0.6, R.orange);
  } },

  giantShell: { size: [3, 3], draw(p) {
    // a big knobbed triton, an orange-lipped mouth, barnacles and a pink anemone riding on top
    p.poly([[6, 72], [10, 50], [24, 34], [44, 22], [66, 12], [90, 4], [84, 24], [74, 44], [62, 64], [44, 80], [24, 90], [10, 86]], R.sand, { shade: 'round', spec: true });
    for (let i = 0; i < 6; i++) {
      const t = i / 6, x = 22 + t * 58, y = 70 - t * 58;
      p.line([[x - 12 * (1 - t * 0.6), y - 6], [x + 10 * (1 - t * 0.6), y + 8]], -2);
      for (let k = -1; k <= 1; k++) p.circle(x + k * 7 * (1 - t * 0.6), y + k * 6, 3.6 * (1 - t * 0.5), R.sand, { shade: 'round', spec: true });
      p.stroke([[x - 8 * (1 - t * 0.6), y - 2], [x + 6 * (1 - t * 0.6), y + 6]], 1.4, R.leather, { tone: 3 });
    }
    p.ellipse(22, 72, 17, 11, R.orange, { rot: -0.7, shade: 'round' });
    p.ellipse(22, 73, 10, 5.4, R.orange, { rot: -0.7, shade: 'facet', tone: 1, edge: false });
    for (let k = 0; k < 5; k++) p.px(12 + k * 4, 80 - k * 3, '#fff4e4');
    for (const [x, y] of [[46, 50], [52, 44], [40, 56]] as V2[]) { p.circle(x, y, 2.6, R.white, { shade: 'round' }); p.px(x, y - 1, '#4a4a54'); }
    p.rect(56, 20, 6, 8, R.pink, { r: 2 });
    for (let i = 0; i < 7; i++) { const a = -Math.PI * 0.9 + (i / 6) * Math.PI * 0.8; p.stroke([[59, 20], [59 + Math.cos(a) * 9, 20 + Math.sin(a) * 8]], 1, R.pink); }
    p.glint(70, 14);
  } },
};
