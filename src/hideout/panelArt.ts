// Home panel art (v8b deep-ink kit, src/ui/pixel/skins.ts): every piece is a flat 1-texel-per-UI-px canvas, the
// same calm look as the HUD and the title: navy faces, 1 px slate borders, wells for content, gold only where
// something is chosen. The exports keep their v6 names so the panels that draw with them did not have to change
// shape:
//
//   panelArt(kind, w, h)          a home panel (the kit's main panel: navy face, slate border, gold corner notches);
//                                 the panel title is set into the top border by the caller (ui.panel legend style)
//   PANEL_IN[kind]                the inner content rect insets [l, t, r, b]
//   wellArt(w, h)                 a recessed well (the kit's inset) for lists and detail panes
//   rowArt(w, h, state)           a list row: flat; hover lifts it, sel adds a gold border and a 2 px gold bar
//   cellArt(s, state)             an item slot (on: gold border)
//   drawerArt / cushionArt / plateArt / windowArt / trayArt          wells, slots and grids in the same style
//   emptyChestArt / emptyMailArt  two small flat pictograms for empty states; pearlArt(s) the pearl currency icon
import { skin, C } from '../ui/pixel/skins';

export type PanelKind = 'chest' | 'bench' | 'wardrobe' | 'trophy' | 'post';
export const PANEL_IN: Record<PanelKind, [number, number, number, number]> = { chest: [12, 18, 12, 12], bench: [12, 18, 12, 12], wardrobe: [11, 18, 11, 11], trophy: [12, 18, 12, 12], post: [12, 18, 12, 12] };

const cache = new Map<string, HTMLCanvasElement>();
function cached(key: string, f: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (!c) { c = f(); cache.set(key, c); if (cache.size > 300) { const k = cache.keys().next().value; if (k !== undefined) cache.delete(k); } }
  return c;
}
/** a flat canvas painter (rects only) */
class Flat {
  cv: HTMLCanvasElement; x: CanvasRenderingContext2D;
  constructor(public w: number, public h: number) { this.cv = document.createElement('canvas'); this.cv.width = w; this.cv.height = h; this.x = this.cv.getContext('2d')!; }
  rect(x: number, y: number, w: number, h: number, c: string, a = 1) { if (w <= 0 || h <= 0) return; this.x.globalAlpha = a; this.x.fillStyle = c; this.x.fillRect(x, y, w, h); this.x.globalAlpha = 1; }
  border(x: number, y: number, w: number, h: number, c: string) { this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c); this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c); }
  round() { for (const [x, y] of [[0, 0], [this.w - 1, 0], [0, this.h - 1], [this.w - 1, this.h - 1]]) this.x.clearRect(x, y, 1, 1); return this; }
}
/** a flat box canvas */
function box(w: number, h: number, face: string, border: string) { const p = new Flat(w, h); p.rect(0, 0, w, h, face); p.border(0, 0, w, h, border); return p.round().cv; }

/** a home panel: the kit's main panel at w x h */
export function panelArt(_kind: PanelKind, w: number, h: number): HTMLCanvasElement {
  return skin('wood', Math.max(40, Math.round(w)), Math.max(40, Math.round(h)));
}

/** a recessed well (the kit's inset); 'plank' (v6: a dark board for light text) is now a sub panel */
export function wellArt(w: number, h: number, tone: 'dark' | 'plank' = 'dark'): HTMLCanvasElement {
  w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
  return skin(tone === 'dark' ? 'inset' : 'dark', w, h);
}

export type RowState = 'off' | 'hover' | 'sel';
/** a list row; `cubbyS` = an icon slot's size (0: none), placed 2 px in from the left / top */
export function rowArt(w: number, h: number, state: RowState, _seed = 0, cubbyS = 0): HTMLCanvasElement {
  w = Math.max(16, Math.round(w)); h = Math.max(8, Math.round(h));
  return cached(`row|${w}|${h}|${state}|${cubbyS}`, () => {
    const p = new Flat(w, h);
    if (state === 'sel') { p.rect(0, 0, w, h, C.navy2); p.border(0, 0, w, h, C.gold0); p.rect(0, 1, 2, h - 2, C.gold); }
    else if (state === 'hover') { p.rect(0, 0, w, h, '#172031'); p.border(0, 0, w, h, C.line2); }
    else { p.rect(0, h - 1, w, 1, C.line, 0.8); }
    if (cubbyS > 0) { const y = Math.round((h - cubbyS) / 2); p.rect(3, y, cubbyS, cubbyS, C.well); p.border(3, y, cubbyS, cubbyS, state === 'sel' ? C.gold0 : C.line); }
    return p.round().cv;
  });
}

/** an item slot, s px square; hover lifts its border; on: gold border */
export function cellArt(s: number, state: 'off' | 'hover' | 'on' = 'off', gem?: string): HTMLCanvasElement {
  s = Math.max(8, Math.round(s));
  return cached(`cell|${s}|${state}|${gem ?? ''}`, () => {
    const p = new Flat(s, s);
    p.rect(0, 0, s, s, state === 'hover' ? '#121a27' : C.well);
    p.border(0, 0, s, s, state === 'on' ? C.gold : state === 'hover' ? C.slate : C.line);
    if (gem) { p.rect(s - 7, s - 7, 5, 5, C.ink); p.rect(s - 6, s - 6, 3, 3, gem); }
    return p.round().cv;
  });
}

/** a drawer (a wardrobe row's bed): a well with a 1 px border */
export function drawerArt(w: number, h: number): HTMLCanvasElement {
  return skin('inset', Math.max(20, Math.round(w)), Math.max(12, Math.round(h)));
}

/** a medal slot (trophy case); hover lifts it; on: gold border */
export function cushionArt(w: number, h: number, state: 'off' | 'hover' | 'on'): HTMLCanvasElement {
  w = Math.max(12, Math.round(w)); h = Math.max(12, Math.round(h));
  return cached(`cush|${w}|${h}|${state}`, () => box(w, h, state === 'off' ? C.well : C.navy2, state === 'on' ? C.gold : state === 'hover' ? C.slate : C.line));
}

/** a detail card (the trophy case's): a sub panel */
export function plateArt(w: number, h: number): HTMLCanvasElement { return skin('dark', Math.max(16, Math.round(w)), Math.max(16, Math.round(h))); }

/** the item display window, s px square: a well with a slate border and a floor line */
export function windowArt(s: number): HTMLCanvasElement {
  s = Math.max(16, Math.round(s));
  return cached(`win|${s}`, () => { const p = new Flat(s, s); p.rect(0, 0, s, s, C.well); p.border(0, 0, s, s, C.line2); p.rect(6, Math.round(s * 0.8), s - 12, 1, C.line); return p.cv; });
}

/** a grid of cols x rows slots, s px pitch (2 px gutters), on a well: the sea chest's tray */
export function trayArt(cols: number, rows: number, s: number): HTMLCanvasElement {
  return cached(`tray|${cols}|${rows}|${s}`, () => {
    const W = cols * s + 4, H = rows * s + 4, p = new Flat(W, H);
    p.rect(0, 0, W, H, '#0c121c'); p.border(0, 0, W, H, C.line);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x = 2 + i * s + 2, y = 2 + j * s + 2, S = s - 2;
      p.rect(x, y, S, S, C.well); p.border(x, y, S, S, '#1f2939');
    }
    return p.round().cv;
  });
}

/** a pearl (the home's currency), s px (5..11): a flat bone bead, one shade step, one glint pixel */
export function pearlArt(s = 7): HTMLCanvasElement {
  s = Math.max(5, Math.min(11, Math.round(s)));
  return cached(`pearl|${s}`, () => {
    const p = new Flat(s + 1, s + 1);
    const r = s / 2, c = (s - 1) / 2;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const dx = x - c, dy = y - c, d = Math.hypot(dx, dy);
      if (d > r - 0.05) continue;
      p.rect(x, y, 1, 1, d > r - 1 ? '#6f6878' : dx + dy > r * 0.5 ? '#bdb3bd' : C.bone2);
    }
    p.rect(Math.round(c - r * 0.35), Math.round(c - r * 0.35), 1, 1, '#ffffff');
    return p.cv;
  });
}

/** the empty sea chest: a small flat open chest pictogram (~64 x 40) */
export function emptyChestArt(): HTMLCanvasElement {
  return cached('emptyChest', () => {
    const W = 64, H = 40, p = new Flat(W, H);
    // the lid, tipped back
    p.rect(12, 2, 40, 10, C.navy2); p.border(12, 2, 40, 10, C.slate);
    // the box
    p.rect(8, 14, 48, 24, C.navy2); p.border(8, 14, 48, 24, C.slate);
    p.rect(9, 15, 46, 5, C.well); p.rect(9, 20, 46, 1, C.line2);
    // the band and the gold clasp
    p.rect(8, 27, 48, 1, C.line2);
    p.rect(29, 24, 6, 7, C.ink); p.rect(30, 25, 4, 5, C.gold); p.rect(31, 27, 2, 2, C.gold0);
    p.rect(4, 38, 56, 1, C.line);
    return p.cv;
  });
}

/** the empty mailbox: a small flat mailbox-on-a-post pictogram with its flag down (~48 x 48) */
export function emptyMailArt(): HTMLCanvasElement {
  return cached('emptyMail', () => {
    const W = 48, H = 48, p = new Flat(W, H);
    p.rect(22, 22, 4, 24, C.slate);
    p.rect(8, 6, 32, 18, C.navy2); p.border(8, 6, 32, 18, C.slate);
    p.rect(12, 10, 12, 10, C.well); p.border(12, 10, 12, 10, C.line2);
    // the flag, down
    p.rect(34, 14, 2, 8, C.dim); p.rect(36, 18, 5, 4, C.red);
    p.rect(6, 46, 36, 1, C.line);
    return p.cv;
  });
}

// ------------------------------------------------------------------ v8b forged pieces, drawn straight into a PixelUI
// (the kit's 3D-forged skins at the canvas density: see src/ui/obj/forge.ts)
type UiF = { frame(kind: import('../ui/pixel/skins').SkinKind, x: number, y: number, w: number, h: number, alpha?: number): void; fill(x: number, y: number, w: number, h: number, col: string, alpha?: number): void };
/** a recessed well */
export function well(ui: UiF, x: number, y: number, w: number, h: number, a = 1) { ui.frame('inset', x, y, w, h, a); }
/** an item slot; on = a sea-glass bezel, hover = a faint lift */
export function cell(ui: UiF, x: number, y: number, s: number, state: 'off' | 'hover' | 'on' = 'off', a = 1) {
  ui.frame(state === 'on' ? 'cardSel' : 'slot', x, y, s, s, a);
  if (state === 'hover') ui.fill(x + 2, y + 2, s - 4, s - 4, '#ffffff', 0.06 * a);
}
/** a sub-panel card */
export function plate(ui: UiF, x: number, y: number, w: number, h: number, a = 1) { ui.frame('dark', x, y, w, h, a); }
/** a list row: sel = a raised ceramic tile in a sea-glass bezel, hover = a raised tile, off = an engraved groove under
 *  it; `cubby` = an inset icon slot at its left */
export function row(ui: UiF, x: number, y: number, w: number, h: number, state: RowState, cubby = 0, a = 1) {
  if (state === 'sel') ui.frame('cardSel', x, y, w, h, a);
  else if (state === 'hover') ui.frame('dark', x, y, w, h, a);
  else { ui.fill(x + 2, y + h - 1, w - 4, 1, '#06090e', 0.7 * a); ui.fill(x + 2, y + h, w - 4, 1, '#2c384c', 0.7 * a); }
  if (cubby > 0) ui.frame('slot', x + 3, y + Math.round((h - cubby) / 2), cubby, cubby, a);
}
/** a grid of cols x rows slots (pitch s) in a well */
export function tray(ui: UiF, x: number, y: number, cols: number, rows: number, s: number) {
  ui.frame('inset', x, y, cols * s + 4, rows * s + 4);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) ui.frame('slot', x + 3 + i * s, y + 3 + j * s, s - 2, s - 2);
}
