// ============================================================================================================
// THE KIT (v8b "deep ink"): the UI style guide. Read this before touching any screen.
// ============================================================================================================
// One calm, flat look for every 2D surface. Ink-navy and slate panels, bone text, ONE muted gold accent, ONE danger
// red. Flat fills, crisp 1 px outlines, generous spacing. No wood, kelp, rope, brass, portholes, bevels, glossy
// highlights, textures or ornament clutter. A few deliberate details only: a thin rule, a small gold corner notch,
// subtle motion (a 4 px rise + fade on open, a 2 px nudge on the selected item).
//
// TEXT: Alagard for every word (src/ui/pixel/font.ts): roles small / body / title / big at integer scales, or
// { size: n } for a wordmark. Bone on dark, ink on parchment. Gold only for the ONE thing that matters on a panel
// (its title, the selected item, a key number); red only for danger / damage / "can't".
//
// PALETTE (import { KIT } or { INK, C } from here; never invent new hues):
//   C.ink    #0b111c  outlines, the deepest shade          C.bone   #e8dfcb  body text on dark
//   C.navy   #131b28  panel face                           C.bone2  #f6f0e2  bright text / numbers
//   C.navy2  #1a2434  raised face (hover, selected row)    C.dim    #9aa3b4  secondary text, labels
//   C.well   #0e141f  insets, slots, bar troughs           C.faint  #687287  hints, disabled
//   C.line   #2c384c  the 1 px panel border                C.parch  #ddd3bd  parchment cards (tooltips, notes)
//   C.line2  #3e4b62  dividers, hover borders              C.inkT   #1b1e27  text on parchment
//   C.gold   #d4b273  THE accent  (gold2 #efe1bd light, gold0 #8a7044 dark)
//   C.red    #c4553f  danger      (red2 #e48a74 light,  red0 #5a231b dark)
//   C.sage   #8fb391  "ready / enough" (use sparingly)    C.steel  #7f9cc4  info, mana, shield
//
// SPACING: a 4 px grid. Panel padding 9-12 px, 6-8 px between rows, 16+ px between groups. Buttons 18 (compact),
// 22 (standard), 26 (primary) tall. Text never closer than 4 px to a border.
//
// HOW TO:
//   panel      ui.panel('wood', x, y, w, h, 'TITLE')         the main panel: navy face, 1 px slate border, gold corner
//                                                            notches, the title set into the top border (a legend).
//              ui.panel('dark', ...)                         a sub panel (no notches, title inside top-left)
//              ui.frame('inset', ...) / 'slot' / 'paper'     a recessed well / an item slot / a parchment card
//   button     ui.button(id, 'GO', x, y, w, 22, { style })   'green' | 'gold' | 'brass' = primary (gold outline, fills
//                                                            gold on hover), 'wood' | 'dark' | 'stone' = neutral
//                                                            (slate), 'red' = danger (red outline), 'blue' = info
//   tag        tag(ui, 'NEW', x, y, 'gold')                  a small flat label: 1 px border, small caps text
//   rule       rule(ui, x, y, w)                             a 1 px divider (C.line2) with a 2 px gold notch on its left
//   bars       ui.bar(x, y, w, 5, v, C.red, C.well, { id })  flat fill, 1 px ink border, eased chip on loss
//   section    sectionHead(ui, 'SOUND', x, y, w)             a gold small-caps label + a rule to the right
//
// Every painter works at 1 texel per UI px (d > 1 returns the same art blown up d x d). Exports keep their v6 names so
// older screens inherit the look: skin / btnSkin / keycapBody / closeArt / tabSkin / knobArt / checkArt.
// ============================================================================================================
import { up } from './decor';

export type SkinKind = 'wood' | 'stone' | 'blueprint' | 'paper' | 'tv' | 'dark' | 'slot' | 'slotBlue' | 'slotTv' | 'card' | 'cardSel' | 'plaque'
  | 'cream' | 'inset' | 'insetCream' | 'brass' | 'sail';
export type BtnStyle = 'wood' | 'blue' | 'tv' | 'red' | 'green' | 'gold' | 'stone' | 'dark' | 'brass';
export type BtnState = 'normal' | 'hover' | 'down' | 'disabled' | 'on';

/** the palette (see the guide above) */
export const C = {
  ink: '#0b111c', navy: '#131b28', navy2: '#1a2434', well: '#0e141f', line: '#2c384c', line2: '#3e4b62', slate: '#56637a',
  bone: '#e8dfcb', bone2: '#f6f0e2', dim: '#9aa3b4', faint: '#687287',
  parch: '#ddd3bd', parch2: '#b9ae96', inkT: '#1b1e27', inkT2: '#5b5a55',
  gold: '#d4b273', gold2: '#efe1bd', gold0: '#8a7044',
  red: '#c4553f', red2: '#e48a74', red0: '#5a231b',
  sage: '#8fb391', sage2: '#b8d3b5', sage0: '#34483a',
  steel: '#7f9cc4', steel2: '#b3c6e2', steel0: '#2c3c58',
} as const;
export const INK = C.ink;

export const PAD: Record<SkinKind, [number, number, number, number]> = {
  wood: [9, 9, 9, 9], stone: [9, 9, 9, 9], cream: [10, 10, 10, 10], blueprint: [7, 7, 7, 7], paper: [6, 5, 6, 7], tv: [5, 5, 5, 5],
  dark: [6, 6, 6, 6], slot: [2, 2, 2, 2], slotBlue: [2, 2, 2, 2], slotTv: [2, 2, 2, 2], card: [4, 4, 4, 4], cardSel: [4, 4, 4, 4],
  plaque: [6, 4, 6, 5], brass: [6, 4, 6, 5], inset: [4, 4, 4, 4], insetCream: [4, 4, 4, 4], sail: [7, 7, 7, 7],
};

/**
 * the kit palette under its v5 / v6 names (older screens read these): every ramp now runs through the deep-ink
 * palette, so `KIT.brass[3]` is the gold accent, `KIT.kelp[2]` the sage "ready", `KIT.coral[2]` the danger red,
 * `KIT.cream[2]` bone text, `KIT.teal[*]` / `KIT.wood[*]` / `KIT.oil[*]` / `KIT.water[*]` navy-slate steps.
 */
export const KIT = {
  ink: C.ink, ink2: '#141c2a',
  teal: ['#0e141f', '#131b28', '#1a2434', '#2c384c', '#3e4b62', '#9aa3b4'],
  brass: ['#3d2f17', C.gold0, '#b8975a', C.gold, C.gold2],
  cream: ['#a69d8a', '#cdc4ae', C.bone, C.bone2],
  oil: ['#0e141f', '#131b28', '#1a2434', '#2c384c'],
  wood: ['#0e141f', '#131b28', '#1a2434', '#222c3e', '#2c384c', '#3e4b62', '#56637a'],
  water: ['#0b111c', '#131b28', '#1a2434', '#3e4b62', '#9aa3b4'],
  sand: ['#8f8572', '#b9ae96', '#cdc4ae', C.parch],
  kelp: [C.sage0, '#5e7f63', C.sage, C.sage2],
  coral: [C.red0, '#8a3a2e', C.red, C.red2],
  sea: [C.steel0, '#4f6a92', C.steel, C.steel2],
  /** text on dark panels / on parchment */
  text: C.bone, textDim: C.dim, textInk: C.inkT, textInkDim: C.inkT2,
  good: C.sage, goodLight: C.sage2, bad: C.red, badLight: C.red2, info: C.steel, infoLight: C.steel2, gold: C.gold,
} as const;

// ------------------------------------------------------------------ the painter
/** a flat 1-texel-per-UI-px canvas: rects only (clean, exact, no anti-aliasing) */
class Flat {
  cv: HTMLCanvasElement; x: CanvasRenderingContext2D;
  constructor(public w: number, public h: number) {
    this.cv = document.createElement('canvas'); this.cv.width = Math.max(1, w); this.cv.height = Math.max(1, h);
    this.x = this.cv.getContext('2d')!;
  }
  rect(x: number, y: number, w: number, h: number, c: string, a = 1) { if (w <= 0 || h <= 0) return; this.x.globalAlpha = a; this.x.fillStyle = c; this.x.fillRect(x, y, w, h); this.x.globalAlpha = 1; }
  px(x: number, y: number, c: string, a = 1) { this.rect(x, y, 1, 1, c, a); }
  clear(x: number, y: number, w = 1, h = 1) { this.x.clearRect(x, y, w, h); }
  /** a 1 px border (corners included) */
  border(x: number, y: number, w: number, h: number, c: string) { this.rect(x, y, w, 1, c); this.rect(x, y + h - 1, w, 1, c); this.rect(x, y, 1, h, c); this.rect(x + w - 1, y, 1, h, c); }
  /** soften the four corners by one pixel (they go transparent) */
  round(x = 0, y = 0, w = this.w, h = this.h) { this.clear(x, y); this.clear(x + w - 1, y); this.clear(x, y + h - 1); this.clear(x + w - 1, y + h - 1); }
  done() { return this.cv; }
}

/** a flat box: face, a 1 px border, softened corners */
function box(w: number, h: number, face: string, border: string, o: { faceA?: number; notch?: string; grid?: string; dashed?: boolean } = {}) {
  const p = new Flat(w, h);
  p.rect(0, 0, w, h, face, o.faceA ?? 1);
  if (o.grid) { for (let x = 8; x < w - 1; x += 8) p.rect(x, 1, 1, h - 2, o.grid); for (let y = 8; y < h - 1; y += 8) p.rect(1, y, w - 2, 1, o.grid); }
  if (o.dashed) {
    p.border(0, 0, w, h, face);
    for (let x = 0; x < w; x++) if (((x >> 1) & 1) === 0) { p.px(x, 0, border); p.px(x, h - 1, border); }
    for (let y = 0; y < h; y++) if (((y >> 1) & 1) === 0) { p.px(0, y, border); p.px(w - 1, y, border); }
  } else p.border(0, 0, w, h, border);
  if (o.notch && w >= 24 && h >= 24) {
    // the small gold corner notches: a 4 px L on each corner, set into the border
    const n = 4;
    for (const [cx, cy, dx, dy] of [[0, 0, 1, 1], [w - 1, 0, -1, 1], [0, h - 1, 1, -1], [w - 1, h - 1, -1, -1]] as const) {
      for (let i = 1; i <= n; i++) { p.px(cx + dx * i, cy, o.notch); p.px(cx, cy + dy * i, o.notch); }
    }
  }
  p.round();
  return p.done();
}

// ------------------------------------------------------------------ cache
const cache = new Map<string, HTMLCanvasElement>();
let cacheTexels = 0;
/** painted canvases, LRU, within a texel budget */
function cached(key: string, fn: () => HTMLCanvasElement) {
  let c = cache.get(key);
  if (c) { cache.delete(key); cache.set(key, c); return c; }
  c = fn(); cache.set(key, c); cacheTexels += c.width * c.height;
  while ((cacheTexels > 16e6 || cache.size > 1200) && cache.size > 1) {
    const first = cache.keys().next().value as string;
    const old = cache.get(first)!; cache.delete(first); cacheTexels -= old.width * old.height;
  }
  return c;
}
const clampD = (d: number) => Math.max(1, Math.min(6, Math.round(d)));
/** the 1x painting, blown up for a caller that asked for density d */
function at(key: string, d: number, paint: () => HTMLCanvasElement) {
  const base = cached(key + '|1', paint);
  return d <= 1 ? base : cached(key + '|' + d, () => up(base, d));
}

/**
 * a panel of the given kind at exactly w x h UI px (1 texel per UI px; d > 1 returns it blown up d x d):
 *   wood / stone      the main panel: navy face, slate border, gold corner notches (titles sit in the top border)
 *   dark / card / tv  a sub panel: navy face, slate border          cardSel: raised face, gold border
 *   cream / paper / sail / plaque / insetCream      parchment (ink text)          brass: a gold tag (ink text)
 *   inset             a recessed well        slot / slotTv: an item slot        slotBlue: a dashed (empty) slot
 *   blueprint         a navy face with a faint 8 px grid (plans, building)
 */
export function skin(kind: SkinKind, w: number, h: number, d = 1): HTMLCanvasElement {
  w = Math.max(4, Math.round(w)); h = Math.max(4, Math.round(h)); d = clampD(d);
  return at(`${kind}|${w}|${h}`, d, () => {
    switch (kind) {
      case 'wood': case 'stone': return box(w, h, C.navy, C.line2, { faceA: 0.97, notch: C.gold0 });
      case 'dark': case 'card': return box(w, h, C.navy, C.line, { faceA: 0.96 });
      case 'tv': return box(w, h, '#101a2c', C.steel0, { faceA: 0.96 });
      case 'cardSel': return box(w, h, C.navy2, C.gold);
      case 'blueprint': return box(w, h, '#111a2a', '#34486a', { faceA: 0.97, grid: '#18243a' });
      case 'cream': case 'paper': case 'sail': case 'plaque': case 'insetCream': return box(w, h, C.parch, '#8f8572');
      case 'brass': return box(w, h, C.gold, C.gold0);
      case 'inset': return box(w, h, C.well, '#222c3e', { faceA: 0.95 });
      case 'slotBlue': return box(w, h, C.well, C.slate, { faceA: 0.9, dashed: true });
      default: return box(w, h, C.well, C.line);
    }
  });
}

// ------------------------------------------------------------------ buttons
/**
 * Button palette per style: the resting face / border / label, and the hover face / border / label. Primary styles
 * (green, gold, brass) are a gold outline that FILLS gold on hover (ink label); neutral (wood, stone, dark) is slate;
 * red is a red outline that fills red on hover; blue / tv are steel.
 */
interface BtnPal { face: string; border: string; text: string; hFace: string; hBorder: string; hText: string; /** v6 names kept for old readers */ textSh: string }
const PRIMARY: BtnPal = { face: C.navy, border: C.gold, text: C.gold2, hFace: C.gold, hBorder: C.gold2, hText: C.inkT, textSh: C.ink };
const NEUTRAL: BtnPal = { face: '#1a2333', border: C.line2, text: C.bone, hFace: '#232e41', hBorder: C.slate, hText: C.bone2, textSh: C.ink };
export const BTN: Record<BtnStyle, BtnPal> = {
  green: PRIMARY, gold: PRIMARY, brass: PRIMARY,
  wood: NEUTRAL, stone: NEUTRAL, dark: { ...NEUTRAL, face: C.navy, border: C.line },
  red: { face: C.navy, border: C.red, text: C.red2, hFace: C.red, hBorder: C.red2, hText: C.bone2, textSh: C.ink },
  blue: { face: '#18233a', border: '#4f6a92', text: C.steel2, hFace: '#22314d', hBorder: C.steel, hText: C.bone2, textSh: C.ink },
  tv: { face: '#18233a', border: '#4f6a92', text: C.steel2, hFace: '#22314d', hBorder: C.steel, hText: C.bone2, textSh: C.ink },
};
/** the label colour of a button in a state */
export function btnText(style: BtnStyle, state: BtnState): string {
  const P = BTN[style];
  if (state === 'disabled') return C.faint;
  return state === 'hover' || state === 'down' ? P.hText : P.text;
}
/** v6: the lip under a face. Flat buttons have none (kept for sizing callers) */
export const LIP = 0;
/** where a button's face sits for a state: [top offset, face height] in UI px (flat: the whole box; a press nudges the
 *  label 1 px down) */
export function btnFace(state: BtnState, h: number): [number, number] {
  return [state === 'down' ? 1 : 0, h];
}
/** v6: the carved label plate inside a face. Flat buttons have none */
export function btnPlate(_style: BtnStyle, _state: BtnState, _w: number, _h: number): [number, number, number, number] | null { return null; }

function paintBtn(style: BtnStyle, state: BtnState, w: number, h: number) {
  const P = BTN[style];
  if (state === 'disabled') return box(w, h, '#121925', '#232c3c');
  const hot = state === 'hover' || state === 'down';
  const face = state === 'down' ? shade(P.hFace, 0.82) : hot ? P.hFace : state === 'on' ? C.navy2 : P.face;
  const border = state === 'on' ? C.gold : hot ? P.hBorder : P.border;
  const cv = box(w, h, face, border);
  // 'on' (a toggled choice): a 2 px gold bar under the label, inside the border
  if (state === 'on' && w > 12) { const x = cv.getContext('2d')!; x.fillStyle = C.gold; x.fillRect(4, h - 3, w - 8, 1); }
  return cv;
}
function shade(hex: string, k: number) {
  const v = parseInt(hex.slice(1, 7), 16);
  return '#' + [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('');
}

export function btnSkin(style: BtnStyle, state: BtnState, w: number, h: number, d = 1): HTMLCanvasElement {
  w = Math.max(6, Math.round(w)); h = Math.max(8, Math.round(h)); d = clampD(d);
  return at(`btn|${style}|${state}|${w}|${h}`, d, () => paintBtn(style, state, w, h));
}

// ------------------------------------------------------------------ small widget art
export const KEYCAP_H = 13;
/**
 * a keycap (no label): flat, a 1 px border. Light (default): a bone cap for ink text; dark: a navy cap for bone
 * text. `down` darkens it.
 */
export function keycapBody(w: number, h = KEYCAP_H, dark = false, down = false, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`kcb|${w}|${h}|${dark}|${down}`, d, () => {
    const face = dark ? (down ? '#26314a' : '#1a2333') : down ? '#b9ae96' : '#d8cfba';
    const p = new Flat(w, h);
    p.rect(0, 0, w, h, face);
    p.border(0, 0, w, h, dark ? C.slate : '#5f5a4e');
    // one line of the key's front edge (flat: the bottom border is 2 px)
    if (!down) p.rect(1, h - 2, w - 2, 1, dark ? C.line2 : '#a99f8a');
    p.round();
    return p.done();
  });
}

/**
 * the close widget: a small square with an X. The canvas is `size` wide and size + 3 tall (UI px; the v6 layout
 * room), the box sits in the top `size` rows. Hover turns it red.
 */
export function closeArt(size: number, state: 'normal' | 'hover' | 'down' | 'disabled', d = 1): HTMLCanvasElement {
  const S = Math.max(11, Math.round(size));
  d = clampD(d);
  return at(`close|${S}|${state}`, d, () => {
    const p = new Flat(S, S + 3);
    const hot = state === 'hover' || state === 'down';
    p.rect(0, 0, S, S, state === 'down' ? C.red0 : hot ? '#2a1a1c' : C.navy);
    p.border(0, 0, S, S, state === 'disabled' ? C.line : hot ? C.red : C.line2);
    p.round(0, 0, S, S);
    const col = state === 'disabled' ? C.faint : hot ? C.red2 : C.bone;
    const m = Math.max(3, Math.round(S * 0.3)), n = S - 2 * m;
    const th = S >= 18 ? 2 : 1;
    for (let i = 0; i < n; i++) for (let k = 0; k < th; k++) { p.px(m + i + k, m + i, col); p.px(m + i + k, m + n - 1 - i, col); }
    return p.done();
  });
}

/** a folder tab (open at the bottom): on = the panel's face with a gold top edge; hover / off = darker */
export function tabSkin(state: 'on' | 'hover' | 'off', w: number, h: number, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`tab|${state}|${w}|${h}`, d, () => {
    const p = new Flat(w, h);
    const face = state === 'on' ? C.navy : state === 'hover' ? '#161f2e' : '#0f1520';
    const edge = state === 'on' ? C.line2 : C.line;
    p.rect(0, 0, w, h, face);
    p.rect(0, 0, 1, h, edge); p.rect(w - 1, 0, 1, h, edge); p.rect(0, 0, w, 1, state === 'on' ? C.gold : edge);
    p.clear(0, 0); p.clear(w - 1, 0);
    return p.done();
  });
}

/** the slider knob (9 x 14 canvas): a slim bone handle, gold when held / hovered */
export function knobArt(state: 'normal' | 'hover' | 'down', d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`knob|${state}`, d, () => {
    const p = new Flat(9, 14);
    p.rect(2, 1, 5, 12, C.ink);
    p.rect(3, 2, 3, 10, state === 'normal' ? C.bone : state === 'hover' ? C.gold2 : C.gold);
    return p.done();
  });
}

/** a checkbox: a dark well with a 1 px border; on = a gold square inside */
export function checkArt(on: boolean, hover: boolean, down: boolean, S = 13, d = 1): HTMLCanvasElement {
  d = clampD(d);
  return at(`chk|${on}|${hover}|${down}|${S}`, d, () => {
    const p = new Flat(S, S);
    p.rect(0, 0, S, S, down ? C.navy2 : C.well);
    p.border(0, 0, S, S, hover || on ? C.gold : C.slate);
    p.round();
    if (on) { const m = Math.max(3, Math.round(S * 0.27)); p.rect(m, m, S - 2 * m, S - 2 * m, C.gold); }
    return p.done();
  });
}

// ------------------------------------------------------------------ motion sprites (kept: PixelUI.bubble with ?uideco=1)
/** a small bubble (radius r UI px): a pale 1 px ring */
export function bubbleArt(r: number, d = 1): HTMLCanvasElement {
  d = clampD(d); r = Math.max(1, Math.min(3, Math.round(r)));
  return at(`bub|${r}`, d, () => {
    const S = r * 2 + 1, p = new Flat(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dd = Math.hypot(x - r, y - r); if (dd <= r + 0.2 && dd > r - 0.9) p.px(x, y, C.steel2, 0.8); }
    return p.done();
  });
}

// ------------------------------------------------------------------ v8b helpers (see the guide at the top)
type UiLike = {
  fill(x: number, y: number, w: number, h: number, col: string, alpha?: number): void;
  text(str: string, x: number, y: number, o?: { font?: 'small' | 'body' | 'title'; color?: string; shadow?: string | null; align?: 'left' | 'center' | 'right'; alpha?: number }): number;
  measure(str: string, font?: 'small' | 'body' | 'title'): number;
  cap(font?: 'small' | 'body' | 'title'): number;
};
/** a 1 px divider with a 2 px gold notch at its left end */
export function rule(ui: UiLike, x: number, y: number, w: number, o: { col?: string; notch?: boolean; alpha?: number } = {}) {
  const a = o.alpha ?? 1;
  ui.fill(x, y, w, 1, o.col ?? C.line2, a);
  if (o.notch !== false) ui.fill(x, y - 1, 2, 3, C.gold, a);
}
/** a section head: a gold small-caps label and a rule running on to the right edge; returns its height */
export function sectionHead(ui: UiLike, label: string, x: number, y: number, w: number, o: { alpha?: number } = {}) {
  const a = o.alpha ?? 1;
  const tw = ui.text(label, x, y, { font: 'small', color: C.gold, shadow: null, alpha: a });
  const ry = y + Math.round(ui.cap('small') / 2);
  ui.fill(Math.round(x + tw + 6), ry, Math.max(0, Math.round(x + w - (x + tw + 6))), 1, C.line2, a);
  return Math.round(ui.cap('small')) + 6;
}
/** a small flat tag: a 1 px border, small text; returns its width */
export function tag(ui: UiLike, label: string, x: number, y: number, tone: 'gold' | 'red' | 'sage' | 'dim' = 'dim', o: { alpha?: number; fill?: boolean } = {}) {
  const a = o.alpha ?? 1;
  const col = tone === 'gold' ? C.gold : tone === 'red' ? C.red2 : tone === 'sage' ? C.sage2 : C.dim;
  const w = Math.ceil(ui.measure(label, 'small')) + 8, h = Math.round(ui.cap('small')) + 6;
  ui.fill(x, y, w, h, o.fill ? col : C.navy, a * (o.fill ? 1 : 0.92));
  ui.fill(x, y, w, 1, col, a); ui.fill(x, y + h - 1, w, 1, col, a); ui.fill(x, y, 1, h, col, a); ui.fill(x + w - 1, y, 1, h, col, a);
  ui.text(label, x + 4, y + 3, { font: 'small', color: o.fill ? C.inkT : col, shadow: null, alpha: a });
  return w;
}

// ------------------------------------------------------------------ v8b (V9): muted rarity + set colours for 2D UI
/** item rarity in the UI: the deep-ink palette's calm versions (RARITY_COLOR in items.ts stays for 3D beams / sparks) */
export const RARITY_UI: Record<string, string> = { common: '#c3bcab', uncommon: C.sage, rare: C.steel, epic: '#a993c9', legendary: C.gold };
/** a saturated game colour (a set's, an element's) calmed for the 2D UI: pulled toward its grey and lifted a touch */
export function soft(hex: string, k = 0.45): string {
  const v = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  const l = 0.3 * r + 0.59 * g + 0.11 * b;
  const m = (c: number) => Math.round(Math.min(255, (c + (l - c) * k) * 0.92 + 14));
  return '#' + [m(r), m(g), m(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}
/** a rarity pip: a 5 x 5 square in the rarity colour with a 1 px ink rim (no glint) */
export function rarityPip(ui: UiLike, x: number, y: number, rarity: string, a = 1) {
  ui.fill(x, y, 5, 5, C.ink, a); ui.fill(x + 1, y + 1, 3, 3, RARITY_UI[rarity] ?? rarity, a);
}
/** a flat item slot drawn with fills: well face, 1 px border (gold when `on`, line2 on hover) */
export function slot(ui: UiLike, x: number, y: number, w: number, h: number, state: 'off' | 'hover' | 'on' = 'off', a = 1) {
  ui.fill(x, y, w, h, state === 'hover' ? '#121a27' : C.well, a);
  const b = state === 'on' ? C.gold : state === 'hover' ? C.slate : C.line;
  ui.fill(x, y, w, 1, b, a); ui.fill(x, y + h - 1, w, 1, b, a); ui.fill(x, y + 1, 1, h - 2, b, a); ui.fill(x + w - 1, y + 1, 1, h - 2, b, a);
}
