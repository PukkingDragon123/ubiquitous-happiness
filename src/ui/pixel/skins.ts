// ============================================================================================================
// THE KIT (v8b "abyssal ceramic", the CORRECTION): detailed, dimensional, crafted. Every frame, button, tab, keycap,
// slot and dial is a real low-poly 3D object (src/ui/obj/forge.ts) lit from the upper left and photographed into a
// canvas at the screen's density, so the 2D UI keeps exact layering and crisp Alagard text on top:
//   CERAMIC slabs (deep blue glaze, a soft gradient) hold content; cast PEWTER bezels rim them; NACRE studs, tablets
//   (panel titles) and light keycaps; SEA-GLASS enamel for primary / selected; CORAL enamel for danger; recessed WELLS
//   (dark floors, sloped walls) for slots, wells and bar troughs; glass-tube bars with a slow glint; a pressure gauge.
// Never the old wood / kelp / rope / brass; no noise, no ornament clutter. Without GL the flat painters below draw.
//
// TEXT: Alagard for every word (src/ui/pixel/font.ts): roles small / body / title / big at integer scales, or
// { size: n } for a wordmark. Bone on ceramic, ink on nacre / ivory. Gold for the ONE thing that matters on a panel,
// red only for danger / damage / "can't".
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
// HOW TO: ui.panel('wood', x, y, w, h, 'TITLE') the main slab (bezel, studs, a nacre title tablet); ui.frame('dark' |
// 'inset' | 'slot' | 'cardSel' | 'plaque' | 'brass' | 'paper', ...) the other pieces; ui.button(id, 'GO', x, y, w, 22,
// { style }) green / gold / brass = sea-glass primary, wood / stone / dark = ceramic, red = coral, blue = steel;
// tag(ui, 'NEW', x, y, tone) an enamel chip; rule() an engraved groove; sectionHead(); ui.bar() a glass tube in a
// trough; ui.sheen() a slow glint across a piece; gaugeArt() + gaugeNeedle() the HUD's dial. A 4 px spacing grid.
// Every painter works at 1 texel per UI px (d > 1 returns the same art blown up d x d). Exports keep their v6 names so
// older screens inherit the look: skin / btnSkin / keycapBody / closeArt / tabSkin / knobArt / checkArt.
// ============================================================================================================
import { up } from './decor';
import * as THREE from 'three';
import { forge, forgeOn, M, slab, ring, stud, gem, boxAt, type Mat } from '../obj/forge';

export type SkinKind = 'wood' | 'stone' | 'blueprint' | 'paper' | 'tv' | 'dark' | 'slot' | 'slotBlue' | 'slotTv' | 'card' | 'cardSel' | 'plaque'
  | 'cream' | 'inset' | 'insetCream' | 'brass' | 'sail' | 'chipRed' | 'chipSage';
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
  plaque: [6, 4, 6, 5], brass: [6, 4, 6, 5], inset: [4, 4, 4, 4], insetCream: [4, 4, 4, 4], sail: [7, 7, 7, 7], chipRed: [4, 4, 4, 4], chipSage: [4, 4, 4, 4],
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


// ------------------------------------------------------------------ v8b FORGED pieces (src/ui/obj/forge.ts)
// Every kind below is a real low-poly 3D object photographed at the caller's density; without GL the flat painters
// further down are used. Layout insets (PAD) are unchanged.
function forgedSkin(kind: SkinKind, w: number, h: number, d: number): HTMLCanvasElement | null {
  if (!forgeOn()) return null;
  return forge('skin|' + kind, w, h, d, (g) => {
    const add = (...m: THREE.Object3D[]) => g.add(...m);
    switch (kind) {
      case 'wood': case 'stone': case 'sail': {
        // the main panel: a ceramic body in a raised pewter bezel, an inset reading face, a fine ivory inlay line and
        // four nacre studs at the corners
        add(slab(w, h, M.ceramicDim, { depth: 4, bev: 2, r: 5 }));
        add(ring(w, h, 5, M.pewter, { depth: 3, bev: 1.6, r: 5, z: 4 }));
        add(slab(w - 10, h - 10, M.ceramic, { depth: 1, bev: 0.8, r: 3, z: 4 }));
        if (w > 40 && h > 40) add(ring(w - 15, h - 15, 1.1, M.ivory, { depth: 0.6, bev: 0, r: 2, z: 5.4 }));
        if (w >= 28 && h >= 28) for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) add(stud(sx * (w / 2 - 2.6), sy * (h / 2 - 2.6), 2.4, M.nacre, 9));
        break;
      }
      case 'dark': case 'card': case 'blueprint':
        add(slab(w, h, M.ceramic, { depth: 3, bev: 1.6, r: 3 }));
        add(ring(w, h, 2.5, M.pewterDark, { depth: 1.4, bev: 0.9, r: 3, z: 3 }));
        break;
      case 'tv':
        add(slab(w, h, M.ceramic, { depth: 3, bev: 1.6, r: 3 }));
        add(ring(w, h, 2.5, M.steel, { depth: 1.4, bev: 0.9, r: 3, z: 3 }));
        break;
      case 'cardSel':
        add(slab(w, h, M.ceramicHi, { depth: 3, bev: 1.6, r: 3 }));
        add(ring(w, h, 2.5, M.glassHi, { depth: 2, bev: 0.9, r: 3, z: 3 }));
        break;
      case 'cream': case 'paper': case 'insetCream':
        add(slab(w, h, M.ivory, { depth: 3, bev: 2, r: 3 }));
        break;
      case 'plaque':
        // a nacre tablet with pewter end caps (panel titles)
        add(slab(w, h, M.nacre, { depth: 3, bev: 2, r: 3 }));
        if (w > 30) for (const sx of [-1, 1]) add(slab(5, h - 4, M.pewter, { depth: 4, bev: 1.2, r: 1, cx: sx * (w / 2 - 4) }));
        break;
      case 'brass':
        add(slab(w, h, M.gold, { depth: 3, bev: 1.6, r: 2 }));
        break;
      case 'chipRed': case 'chipSage':
        add(slab(w, h, kind === 'chipRed' ? M.coral : M.glass, { depth: 2.5, bev: 1.3, r: 2 }));
        break;
      case 'inset': case 'slot': case 'slotTv': case 'slotBlue': {
        // recessed: a dark floor, a ring whose inner walls slope in (lit lower right, shaded upper left)
        const t = kind === 'inset' ? 3 : 2.4;
        add(slab(w, h, M.well, { depth: 0.5, bev: 0, r: 3 }));
        add(ring(w, h, t, kind === 'slotBlue' ? M.ceramicDim : kind === 'slotTv' ? M.steel : M.ceramic, { depth: 1.5, bev: Math.min(1.4, t / 2 - 0.2), r: 3, z: 0.5 }));
        break;
      }
    }
  });
}
type FBtn = { face: Mat; hi: Mat; rim: Mat };
function btnMats(style: BtnStyle): FBtn {
  switch (style) {
    case 'green': case 'gold': case 'brass': return { face: M.glass, hi: M.glassHi, rim: M.pewter };
    case 'red': return { face: M.coral, hi: M.coralHi, rim: M.pewter };
    case 'blue': case 'tv': return { face: M.steel, hi: M.steelHi, rim: M.pewter };
    case 'dark': return { face: M.ceramicDim, hi: M.ceramic, rim: M.pewterDark };
    default: return { face: M.ceramic, hi: M.ceramicHi, rim: M.pewter };
  }
}
/** a button: an enamel / ceramic face set in a pewter bezel; hover tips it toward you and lifts the light, a press
 *  sinks it; 'on' rings it in nacre */
function forgedBtn(style: BtnStyle, state: BtnState, w: number, h: number, d: number): HTMLCanvasElement | null {
  if (!forgeOn()) return null;
  const P = btnMats(style), hot = state === 'hover', down = state === 'down', dis = state === 'disabled';
  return forge(`btn|${style}|${state}`, w, h, d, (g) => {
    g.add(slab(w - 1, h - 1, dis ? M.disabled : hot ? P.hi : P.face, { depth: down ? 1.5 : 3, bev: 1.6, r: 3 }));
    g.add(ring(w - 1, h - 1, 2, dis ? M.pewterDark : state === 'on' ? M.nacre : P.rim, { depth: 1.6, bev: 0.8, r: 3, z: down ? 1.5 : 3 }));
  }, { tilt: hot ? 0.16 : 0, light: hot ? 1.18 : down ? 0.85 : dis ? 0.7 : 1 });
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
  const fz = forgedSkin(kind, w, h, d);
  if (fz) return fz;
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
const PRIMARY: BtnPal = { face: C.navy, border: C.gold, text: C.bone2, hFace: C.gold, hBorder: C.gold2, hText: '#fffaf0', textSh: C.ink };
const NEUTRAL: BtnPal = { face: '#1a2333', border: C.line2, text: C.bone, hFace: '#232e41', hBorder: C.slate, hText: '#fffaf0', textSh: C.ink };
export const BTN: Record<BtnStyle, BtnPal> = {
  green: PRIMARY, gold: PRIMARY, brass: PRIMARY,
  wood: NEUTRAL, stone: NEUTRAL, dark: { ...NEUTRAL, face: C.navy, border: C.line },
  red: { face: C.navy, border: C.red, text: C.bone2, hFace: C.red, hBorder: C.red2, hText: '#fffaf0', textSh: C.ink },
  blue: { face: '#18233a', border: '#4f6a92', text: C.bone2, hFace: '#22314d', hBorder: C.steel, hText: C.bone2, textSh: C.ink },
  tv: { face: '#18233a', border: '#4f6a92', text: C.bone2, hFace: '#22314d', hBorder: C.steel, hText: C.bone2, textSh: C.ink },
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
  const fz = forgedBtn(style, state, w, h, d);
  if (fz) return fz;
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
  if (forgeOn()) {
    const fz = forge(`kcap|${dark}|${down}`, w, h, d, (g) => {
      g.add(slab(w - 1, h - 1, M.pewterDark, { depth: 1, bev: 0.6, r: 2 }));
      g.add(slab(w - 3, h - 3, dark ? M.ceramicHi : M.nacre, { depth: down ? 1.2 : 2.6, bev: 1.1, r: 2, z: 1, cy: 0.5 }));
    }, { light: down ? 0.85 : 1 });
    if (fz) return fz;
  }
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
  if (forgeOn()) {
    const hot = state === 'hover' || state === 'down';
    const fz = forge(`close|${state}`, S, S, d, (g) => {
      g.add(slab(S - 1, S - 1, hot ? M.coral : M.ceramic, { depth: state === 'down' ? 1.5 : 3, bev: 1.2, r: 2 }));
      g.add(ring(S - 1, S - 1, 1.8, state === 'disabled' ? M.pewterDark : M.pewter, { depth: 1.4, bev: 0.7, r: 2, z: 3 }));
      const L = S * 0.5, t = Math.max(1.4, S * 0.13), mt = state === 'disabled' ? M.pewterDark : M.nacre;
      g.add(boxAt(0, 0, L, t, 1.2, mt, 4.4, Math.PI / 4)); g.add(boxAt(0, 0, L, t, 1.2, mt, 4.4, -Math.PI / 4));
    }, { tilt: state === 'hover' ? 0.14 : 0, light: hot ? 1.15 : 1 });
    if (fz) {
      return at(`closeF|${S}|${state}`, 1, () => { const c = document.createElement('canvas'); c.width = fz.width; c.height = fz.height + 3 * d; c.getContext('2d')!.drawImage(fz, 0, 0); return c; });
    }
  }
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
  if (forgeOn()) {
    const fz = forge(`tab|${state}`, w, h, d, (g) => {
      // a tab: its lower chamfer hangs off the bottom of the shot, so it opens into the panel under it
      const sub = new THREE.Group(); sub.position.y = -4;
      sub.add(slab(w - 1, h + 8, state === 'on' ? M.ceramic : state === 'hover' ? M.ceramicHi : M.ceramicDim, { depth: 3, bev: 1.4, r: 3 }));
      sub.add(ring(w - 1, h + 8, 2, state === 'on' ? M.pewter : M.pewterDark, { depth: 1.4, bev: 0.7, r: 3, z: 3 }));
      if (state === 'on') sub.add(slab(w - 10, 2, M.nacre, { depth: 1, bev: 0.4, r: 1, cy: h / 2 + 4 - 4.5, z: 3 }));
      g.add(sub);
    });
    if (fz) return fz;
  }
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
  if (forgeOn()) {
    const fz = forge(`knob|${state}`, 9, 14, d, (g) => { g.add(slab(8, 13, state === 'normal' ? M.nacre : M.glassHi, { depth: 4, bev: 1.8, r: 2 })); g.add(boxAt(0, 0, 4, 1, 1, M.pewterDark, 5.5)); }, { light: state === 'down' ? 0.9 : 1.05 });
    if (fz) return fz;
  }
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
  if (forgeOn()) {
    const fz = forge(`chk|${on}|${hover}|${down}`, S, S, d, (g) => {
      g.add(slab(S - 1, S - 1, M.well, { depth: 0.5, bev: 0, r: 2 }));
      g.add(ring(S - 1, S - 1, 2.2, hover ? M.pewter : M.pewterDark, { depth: 1.6, bev: 0.9, r: 2, z: 0.5 }));
      if (on) g.add(gem(0, 0, S * 0.26, M.glassHi, 1.5));
    });
    if (fz) return fz;
  }
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
  frame?(kind: SkinKind, x: number, y: number, w: number, h: number, alpha?: number): void;
  text(str: string, x: number, y: number, o?: { font?: 'small' | 'body' | 'title'; color?: string; shadow?: string | null; align?: 'left' | 'center' | 'right'; alpha?: number }): number;
  measure(str: string, font?: 'small' | 'body' | 'title'): number;
  cap(font?: 'small' | 'body' | 'title'): number;
};
/** an engraved groove (a dark cut over a lit lip, lit from above) with a small nacre lozenge at its left end */
export function rule(ui: UiLike, x: number, y: number, w: number, o: { col?: string; notch?: boolean; alpha?: number } = {}) {
  const a = o.alpha ?? 1;
  ui.fill(x, y, w, 1, '#06090e', 0.75 * a); ui.fill(x, y + 1, w, 1, o.col ?? '#3e4b62', 0.8 * a);
  if (o.notch !== false) { ui.fill(x - 1, y, 3, 2, '#e7ddcb', a); ui.fill(x, y - 1, 1, 4, '#e7ddcb', a); }
}
/** a section head: a gold small-caps label and a rule running on to the right edge; returns its height */
export function sectionHead(ui: UiLike, label: string, x: number, y: number, w: number, o: { alpha?: number } = {}) {
  const a = o.alpha ?? 1;
  const tw = ui.text(label, x, y, { font: 'small', color: C.gold, shadow: null, alpha: a });
  const ry = y + Math.round(ui.cap('small') / 2);
  const rx = Math.round(x + tw + 6), rw = Math.max(0, Math.round(x + w - rx));
  ui.fill(rx, ry, rw, 1, '#06090e', 0.75 * a); ui.fill(rx, ry + 1, rw, 1, '#3e4b62', 0.8 * a);
  return Math.round(ui.cap('small')) + 6;
}
/** a small enamel chip (forged): small text on a bevelled slab in its tone; returns its width */
export function tag(ui: UiLike, label: string, x: number, y: number, tone: 'gold' | 'red' | 'sage' | 'dim' = 'dim', o: { alpha?: number; fill?: boolean } = {}) {
  const a = o.alpha ?? 1;
  const w = Math.ceil(ui.measure(label, 'small')) + 10, h = Math.round(ui.cap('small')) + 7;
  const kind: SkinKind = tone === 'gold' ? (o.fill ? 'brass' : 'cardSel') : tone === 'red' ? 'chipRed' : tone === 'sage' ? 'chipSage' : 'dark';
  if (ui.frame) ui.frame(kind, x, y, w, h, a); else ui.fill(x, y, w, h, C.navy, a);
  const col = kind === 'brass' ? C.inkT : tone === 'gold' ? C.gold2 : tone === 'red' ? '#f6e6de' : tone === 'sage' ? '#eef4ea' : C.bone;
  ui.text(label, x + 5, y + 4, { font: 'small', color: col, shadow: null, alpha: a });
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
/** an item slot (forged inset; on: a sea-glass rim, hover: lifted) */
export function slot(ui: UiLike, x: number, y: number, w: number, h: number, state: 'off' | 'hover' | 'on' = 'off', a = 1) {
  if (ui.frame) ui.frame(state === 'on' ? 'cardSel' : 'slot', x, y, w, h, a);
  else ui.fill(x, y, w, h, C.well, a);
  if (state === 'hover') ui.fill(x + 2, y + 2, w - 4, h - 4, '#ffffff', 0.05 * a);
}

/**
 * a forged pressure gauge (S x S UI px): a pewter bezel, a nacre dial with engraved ticks and a coral danger arc at
 * the low end, a pewter boss in the middle. The needle is drawn live over it (gaugeNeedle). Null without GL.
 */
export function gaugeArt(S: number, d = 1): HTMLCanvasElement | null {
  if (!forgeOn()) return null;
  return forge('gauge', S, S, d, (g) => {
    const r = S / 2 - 0.5;
    const ringG = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 3, 18, 1), M.pewter); ringG.rotation.x = Math.PI / 2; ringG.position.z = 1.5; g.add(ringG);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(r - 3, r - 3, 1, 18, 1), M.nacre); face.rotation.x = Math.PI / 2; face.position.z = 3.2; g.add(face);
    for (let i = 0; i <= 10; i++) {
      const a = (-135 + i * 27) * Math.PI / 180, rr = r - 6;
      g.add(boxAt(Math.sin(a) * rr, Math.cos(a) * rr, 1, i % 5 === 0 ? 3.2 : 2, 0.6, i <= 2 ? M.coral : M.pewterDark, 3.7, -a));
    }
    const boss = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 2, 8, 1), M.pewter); boss.rotation.x = Math.PI / 2; boss.position.z = 5; g.add(boss);
  });
}
/** the gauge's needle for a value 0..1 (sweeps -135 .. 135 degrees), drawn as pixels from the centre */
export function gaugeNeedle(ui: UiLike, cx: number, cy: number, r: number, v: number, col = '#9a4538', a = 1) {
  const ang = (-135 + Math.max(0, Math.min(1, v)) * 270) * Math.PI / 180;
  const sx = Math.sin(ang), sy = -Math.cos(ang);
  for (let i = -2; i <= r; i++) ui.fill(Math.round(cx + sx * i), Math.round(cy + sy * i), i > r - 3 ? 1 : 2, i > r - 3 ? 1 : 2, i < 0 ? '#1b1e27' : col, a);
  ui.fill(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3, '#e7ddcb', a);
}
