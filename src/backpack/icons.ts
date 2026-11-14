// Item icons (v3): every item is a hand-made design in iconArt.ts, painted by the Pix painter (pix.ts) in the
// ramps of ramps.ts, 32 px per grid cell, crisp at any size. Merge levels add small silver / gold pips.
//
//   paintIcon(def, level)            the 32-px-per-cell canvas (items.ts caches it as itemIcon(id, level))
//   paintIconAt(def, level, cell)    the same design re-rasterised at `cell` px per cell (16 / 24 for lists)
//
// An item without a design yet (a new id) gets a generic v3 sack with its rarity colour, never a broken image.
import type { ItemDef } from '../game/items';
import { EMIT_MASK } from './voxel';
import { ICON_ART, type IconDesign } from './iconArt';
import { Pix } from './pix';
import { R } from './ramps';

const RARITY_RAMP: Record<string, typeof R.cloth> = { common: R.cloth, uncommon: R.green, rare: R.blue, epic: R.violet, legendary: R.gold };

/** a burlap sack tied with twine, tinted by rarity: the stand-in for items that have no design yet */
function fallbackDesign(d: ItemDef): IconDesign {
  return { size: [1, 1], draw(p) {
    p.ellipse(16, 20, 11, 10, R.sand, { spec: false });
    p.poly([[10, 12], [22, 12], [25, 5], [19, 8], [16, 4], [13, 8], [7, 5]], R.sand, { shade: 'round' });
    p.rect(10, 11, 12, 3, RARITY_RAMP[d.rarity] ?? R.cloth, { r: 1 });
    p.rect(13, 17, 7, 8, R.paper, { r: 1 });
    p.line([[15, 19], [17, 19], [17, 21], [16, 21], [16, 22]], '#3a2a1a'); p.px(16, 24, '#3a2a1a');
  } };
}

/** the 32-px-per-cell icon canvas for an item */
export function paintIcon(d: ItemDef, level = 1): HTMLCanvasElement {
  return paintIconAt(d, level, 32)!;
}

/**
 * v3: paint an item from its ICON_ART design at `cell` px per grid cell (32 = the pack; 16 / 24 for lists and
 * the HUD: the same design re-rasterised, so small icons stay crisp instead of being downsampled). The design
 * is centred in the item's shape box (integer-upscaled when the shape is at least twice the design); cells
 * outside an L-shape are cut before the outline so it wraps the cut.
 */
export function paintIconAt(d: ItemDef, level = 1, cell = 32): HTMLCanvasElement {
  const art = ICON_ART[d.id] ?? fallbackDesign(d);
  const cw = Math.max(...d.shape.map((c) => c[0])) + 1, ch = Math.max(...d.shape.map((c) => c[1])) + 1;
  const [dw, dh] = art.size ?? [cw, ch];
  let fit = Math.min(cw / dw, ch / dh);
  fit = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
  const K = (cell / 32) * fit;
  const W = Math.round(cw * cell), H = Math.round(ch * cell);
  const p = new Pix(W, H, K);
  p.ox = Math.floor((W - dw * 32 * K) / 2) / K;
  p.oy = Math.floor((H - dh * 32 * K) / 2) / K;
  art.draw(p);
  if (d.shape.length < cw * ch) {
    const cells = new Set(d.shape.map(([x, y]) => x + ',' + y));
    p.erase((x, y) => { const gx = (x + p.ox) * K, gy = (y + p.oy) * K; return !cells.has(Math.floor(gx / cell) + ',' + Math.floor(gy / cell)); });
  }
  const cv = p.render();
  if (level > 1) levelPips(cv, level, cell);
  if (cell === 32) {
    let any = false; for (const v of p.emit) if (v) { any = true; break; }
    if (any) EMIT_MASK.set(cv, p.emit);
  }
  return cv;
}

/** merge-level marks: small silver (2) / gold (3) diamonds in the bottom-left, plus a sparkle top-right */
function levelPips(cv: HTMLCanvasElement, level: number, cell: number) {
  const x = cv.getContext('2d')!;
  const gold = level >= 3;
  const fill = gold ? '#ffd040' : '#dceeff', out = gold ? '#4a2400' : '#16244a', hi = '#ffffff';
  const s = cell >= 24 ? 1 : 0;
  for (let k = 0; k < level; k++) {
    const cx = 3 + s + k * (4 + s * 2), cy = cv.height - 3 - s;
    const px = (dx: number, dy: number, c: string) => { x.fillStyle = c; x.fillRect(cx + dx, cy + dy, 1, 1); };
    if (s) {
      for (const [dx, dy] of [[0, -2], [-1, -1], [1, -1], [-2, 0], [2, 0], [-1, 1], [1, 1], [0, 2]]) px(dx, dy, out);
      px(0, -1, hi); px(-1, 0, fill); px(0, 0, fill); px(1, 0, fill); px(0, 1, fill);
    } else { px(0, -1, out); px(-1, 0, out); px(1, 0, out); px(0, 1, out); px(0, 0, fill); }
  }
}
