// TAGS: the hub's words live on cards hung on things. A Tag is a kit card (src/ui/pixel: a sailcloth card with a
// stitched hem hung on a little rope loop, or a rope-trimmed dark-water card) whose lines are set in the UI's screen font, floating at a
// world anchor (a station, an item, a poster). v5: tags are drawn by the PixelUI that is drawing when place() is
// called (the screen's own UI), so they share the kit's pixel size and fonts exactly, crisp at any resolution; the
// `mesh` stays for API compatibility (add it to the scene as before: it is never visible). A TableCard is the same
// card painted onto a surface (a texture in the 3D scene, classic fonts).
//
//   const t = new Tag('paper'); scene.add(t.mesh);
//   t.show([{ text: 'Kelp Cathedral', font: 'title' }, { text: 'Towering kelp', color: '#3a2810' }, { text: 'enter', key: 'E' }]);
//   t.place(camera, anchorWorld, internalHeight, [dx, dy]);   every frame while shown (inside ui.begin/end);  t.hide()
//
// Line fonts default to 'body'; a first line in 'title' is the heading (accent colour, a rule under it); a line
// with `key` gets that keycap in front (the hint row).
import * as THREE from 'three';
import { drawText, measure, lineH, wrap, type FontName } from '../ui/pixel/font';
import { PixelUI, drawCard, cardLayout, keyName } from '../ui/pixel/ui';
import { KIT, skin, type SkinKind } from '../ui/pixel/skins';
import { easeOutBack } from '../core/math';

export interface TagLine {
  text: string; font?: FontName; color?: string; gap?: number; key?: string;
  /** v7 'float' tags: an item icon before the text */
  icon?: string;
  /** v7 'float' tags: a kit icon (src/ui/pixel/art.ts: 'mail', 'star' ...) before the text */
  kicon?: string;
  /** v7 'float' tags: a row of material chips [id, have, need] (icon + have/need, green when met) instead of text */
  cost?: [string, number, number][];
}
/** v7: 'float' is the home's compact hover card (a slim dark-water plate on a pointer, light text, material chips) */
export type TagStyle = 'paper' | 'wood' | 'brass' | 'slate' | 'float';

const kindOf = (s: TagStyle): SkinKind => (s === 'paper' || s === 'brass' ? 'paper' : 'dark');
/** tag lines -> card lines (default fonts and colours per style) */
function cardLines(lines: TagLine[], style: TagStyle) {
  const dark = kindOf(style) === 'dark';
  return lines.map((l, i) => ({
    text: l.text, key: l.key, gap: l.gap,
    font: l.font ?? 'body',
    color: l.color ?? (i === 0 && l.font === 'title' ? (dark ? KIT.brass[3] : KIT.teal[2]) : dark ? KIT.text : KIT.textInk),
  }));
}

/** draw a tag card with a PixelUI at a UI position (top-left); returns its rect */
export function drawTag(ui: PixelUI, lines: TagLine[], style: TagStyle, maxW: number, x: number, y: number, alpha = 1) {
  if (style === 'float') return drawFloat(ui, lines, maxW, x, y, alpha);
  return drawCard(ui, cardLines(lines, style), kindOf(style), maxW, [x, y], { alpha, pin: style === 'paper' });
}

// ------------------------------------------------------------------ v7 float cards (the home's hover tags)
// A compact, quiet card: a dark-water plate (ink rim, a lit top lip, a darker foot, two flat tones and nothing else),
// a brass hairline under the name, light text in two sizes, material chips as icon + have/need, and a little pointer
// under it at the thing it names. Small enough to sit beside furniture without covering the room.
const F = { ink: '#071116', rim: '#102a30', body: '#14343a', body2: '#112d33', lip: '#2c5a5c', foot: '#0b1f24', brass: '#c8913a', brassL: '#f2c66d', name: '#f6ecd2', sub: '#a9cfc4', good: '#9be07a', bad: '#ff9a84' };
export const FLOAT = F;
const PADX = 6, PADY = 4, CHIP = 11;
interface FRow { line: TagLine; font: FontName; h: number; w: number; text: string[] }
function floatRows(ui: PixelUI, lines: TagLine[], maxW: number): { rows: FRow[]; w: number; h: number } {
  const rows: FRow[] = [];
  let w = 40;
  lines.forEach((l, i) => {
    if (l.cost) {
      const cw = l.cost.reduce((a, [, hv, nd]) => a + CHIP + 2 + ui.measure(`${Math.min(hv, nd)}/${nd}`, 'small') + 7, -7);
      rows.push({ line: l, font: 'small', h: CHIP + 1, w: cw, text: [] });
      w = Math.max(w, cw); return;
    }
    const font: FontName = l.font === 'title' || (i === 0 && !l.font) ? 'body' : l.font ?? 'small';
    const kw = l.key ? ui.keycapW(l.key) + 3 : 0, iw = l.icon ? 13 : l.kicon ? 12 : 0;
    const text = ui.wrap(l.text, font, maxW - kw - iw);
    const tw = Math.max(...text.map((t) => ui.measure(t, font))) + kw + iw;
    rows.push({ line: l, font, h: Math.max(text.length * ui.lh(font), l.key ? 13 : 0) - (font === 'body' ? 1 : 0), w: tw, text });
    w = Math.max(w, tw);
  });
  const h = rows.reduce((a, r, i) => a + r.h + (i ? 2 + (r.line.gap ?? 0) : 0), 0) + (rows.length > 1 ? 3 : 0);
  return { rows, w: Math.ceil(w) + PADX * 2, h: h + PADY * 2 };
}
export function floatLayout(ui: PixelUI, lines: TagLine[], maxW: number) { const L = floatRows(ui, lines, maxW); return { w: L.w, h: L.h + 4 }; }
/** a float card at (x, y) top-left (its pointer hangs 4 px below at px, default the centre; px -1: no pointer);
 *  returns its rect */
export function drawFloat(ui: PixelUI, lines: TagLine[], maxW: number, x: number, y: number, alpha = 1, px?: number) {
  const { rows, w, h } = floatRows(ui, lines, maxW);
  x = Math.round(x); y = Math.round(y);
  const a = alpha;
  // the plate: a soft cast shadow, the ink rim with clipped corners, two flat body tones, a lit lip, a dark foot
  ui.fill(x + 2, y + 2, w, h, '#000000', 0.3 * a);
  ui.fill(x + 1, y, w - 2, h, F.ink, a); ui.fill(x, y + 1, w, h - 2, F.ink, a);
  ui.fill(x + 1, y + 1, w - 2, h - 2, F.body, a);
  ui.fill(x + 1, y + Math.round(h * 0.55), w - 2, h - 2 - Math.round(h * 0.55) + 1, F.body2, a);
  ui.fill(x + 2, y + 1, w - 4, 1, F.lip, a);
  ui.fill(x + 2, y + h - 2, w - 4, 1, F.foot, a);
  // brass corner ticks (a hint of the kit's fittings)
  ui.fill(x + 2, y + 1, 3, 1, F.brassL, a); ui.fill(x + 1, y + 2, 1, 2, F.brass, a);
  ui.fill(x + w - 5, y + 1, 3, 1, F.brassL, a); ui.fill(x + w - 2, y + 2, 1, 2, F.brass, a);
  // the pointer under the plate
  if (px !== -1) {
    const pxx = Math.round(Math.max(x + 6, Math.min(x + w - 7, px ?? x + w / 2)));
    for (let i = 0; i < 4; i++) { ui.fill(pxx - 3 + i, y + h - 1 + i, 7 - i * 2, 1, F.ink, a); if (i < 3) ui.fill(pxx - 2 + i, y + h - 1 + i, 5 - i * 2, 1, i === 0 ? F.body2 : F.foot, a); }
  }
  let yy = y + PADY;
  rows.forEach((r, i) => {
    if (i) yy += 2 + (r.line.gap ?? 0);
    if (i === 1) { ui.fill(x + PADX, yy - 2, w - PADX * 2, 1, F.brass, 0.55 * a); yy += 2; }
    const l = r.line;
    if (l.cost) {
      let cx = x + PADX;
      for (const [id, hv, nd] of l.cost) {
        const ok = hv >= nd;
        ui.item(id, cx, yy, CHIP, CHIP, 1, a);
        const t = `${Math.min(hv, nd)}/${nd}`;
        ui.text(t, cx + CHIP + 2, yy + Math.round((CHIP - ui.cap('small')) / 2), { font: 'small', color: ok ? F.good : F.bad, shadow: F.ink, alpha: a });
        cx += CHIP + 2 + ui.measure(t, 'small') + 7;
      }
      yy += r.h; return;
    }
    let tx = x + PADX;
    if (l.key) { const kn = keyName(l.key); ui.keycap(kn, tx, yy - 2, true); tx += ui.keycapW(kn) + 3; }
    if (l.icon) { ui.item(l.icon, tx, yy - 2, 11, 11, 1, a); tx += 13; }
    if (l.kicon) { ui.icon(l.kicon, tx, yy + Math.round((ui.cap(r.font) - 6) / 2), a); tx += 12; }
    const col = l.color ?? (i === 0 ? F.name : F.sub);
    r.text.forEach((t, k) => ui.text(t, tx, yy + k * ui.lh(r.font), { font: r.font, color: col, shadow: F.ink, alpha: a }));
    yy += r.h;
  });
  return { x, y, w, h: px === -1 ? h : h + 4 };
}

/**
 * paint lines onto a fresh canvas (classic fonts, for 3D surfaces: TableCard): the kit's 1x seaweed-paper card (fibres,
 * a card edge, a pressed sprig) or its rope-trimmed dark-water card for wood / slate, with the text set on it.
 */
export function paintTag(lines: TagLine[], style: TagStyle, maxW = 150, pad = 6): HTMLCanvasElement {
  const dark = style === 'wood' || style === 'slate';
  const rows: { text: string; font: FontName; color: string; key?: string; y: number }[] = [];
  let y = pad, w = 0;
  for (const l of lines) {
    const font = l.font === 'title' ? 'body' : l.font ?? 'small';
    y += l.gap ?? 0;
    const kw = l.key ? measure(l.key, 'small') + 7 : 0;
    for (const s of wrap(l.text, font, maxW - kw)) { rows.push({ text: s, font, color: l.color ?? (dark ? KIT.text : KIT.textInk), key: rows.length && !l.key ? undefined : l.key, y }); w = Math.max(w, measure(s, font) + kw); y += lineH(font); }
  }
  const W = Math.ceil(w + pad * 2), H = Math.ceil(y + pad);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const fill = (x: number, yy: number, ww: number, hh: number, col: string) => { c.fillStyle = col; c.fillRect(x, yy, ww, hh); };
  c.imageSmoothingEnabled = false;
  c.drawImage(skin(dark ? 'dark' : 'paper', W, H), 0, 0);
  for (const r of rows) {
    let x = pad;
    if (r.key) {
      const kw = measure(r.key, 'small') + 4;
      fill(x, r.y - 2, kw, lineH('small') + 1, KIT.ink);
      fill(x + 1, r.y - 1, kw - 2, lineH('small') - 1, KIT.cream[2]);
      drawText(c, r.key, x + 2, r.y, { font: 'small', color: KIT.ink, shadow: null });
      x += kw + 3;
    }
    drawText(c, r.text, x, r.y, { font: r.font, color: r.color, shadow: dark ? undefined : null });
  }
  return cv;
}

function canvasTex(cv: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Tag {
  /** kept for API compatibility (screens add it to their scene): never visible, the card is drawn by the UI */
  mesh: THREE.Mesh;
  private lines: TagLine[] = [];
  private key = '';
  private shown = false;
  private pop = 0;
  /** UI px per rendered (internal) px, from the last place() */
  private k = 1;
  private wUI = 1; private hUI = 1;
  private v = new THREE.Vector3();
  constructor(private style: TagStyle = 'paper', private maxW = 150) {
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.mesh.visible = false; this.mesh.frustumCulled = false;
  }
  /** the card's size in rendered (internal) pixels, the units of place()'s offsets */
  get w() { return this.wUI / this.k; }
  get h() { return this.hUI / this.k; }
  show(lines: TagLine[]) {
    const key = JSON.stringify(lines);
    if (key !== this.key) {
      this.key = key; this.lines = lines;
      if (!this.shown) this.pop = 0;
      this.measure(PixelUI.current);
    }
    this.shown = true;
  }
  hide() { this.shown = false; this.key = ''; this.pop = 0; }
  get visible() { return this.shown; }
  private measure(ui: PixelUI | null) {
    if (!ui) return;
    const L = this.style === 'float' ? floatLayout(ui, this.lines, Math.min(this.maxW, ui.w - 16)) : cardLayout(ui, cardLines(this.lines, this.style), kindOf(this.style), Math.min(this.maxW + 20, ui.w - 16));
    this.wUI = L.w; this.hUI = L.h;
  }
  /**
   * float the card at an anchor's screen position: `off` is in rendered (internal) pixels as before, the card's
   * bottom-centre by default (or its left / right edge, vertically centred), clamped on screen, dropping in on
   * its rope. Call inside the screen UI's begin()/end(); otherwise it draws on the next screen UI end().
   */
  place(cam: THREE.PerspectiveCamera, anchor: THREE.Vector3, internalH: number, off: [number, number] = [0, -10], dt = 1 / 60, align: 'bottom' | 'left' | 'right' = 'bottom') {
    if (!this.shown) return;
    this.pop = Math.min(1, this.pop + dt / 0.16);
    const ndc = this.v.copy(anchor).project(cam);
    if (ndc.z > 1) return;
    const nx = ndc.x, ny = ndc.y;
    const draw = (ui: PixelUI) => {
      this.k = ui.h / Math.max(1, internalH);
      this.measure(ui);
      const w = this.wUI, h = this.hUI;
      const ax = (nx * 0.5 + 0.5) * ui.w + off[0] * this.k, ay = (1 - (ny * 0.5 + 0.5)) * ui.h + off[1] * this.k;
      let x: number, y: number;
      if (align === 'bottom') { x = ax - w / 2; y = ay - h; } else if (align === 'left') { x = ax; y = ay - h / 2; } else { x = ax - w; y = ay - h / 2; }
      x = Math.round(Math.max(4, Math.min(ui.w - 4 - w, x)));
      y = Math.round(Math.max(4, Math.min(ui.h - 4 - h, y)));
      // don't cover a tag already drawn this frame: slide above or below it, whichever moves less and stays on screen
      for (const [ox, oy, ow, oh] of ui.tagRects) {
        if (x >= ox + ow + 2 || x + w + 2 <= ox || y >= oy + oh + 2 || y + h + 2 <= oy) continue;
        const up = oy - h - 4, dn = oy + oh + 4;
        const okUp = up >= 4, okDn = dn + h <= ui.h - 4;
        y = okUp && (!okDn || Math.abs(up - y) <= Math.abs(dn - y)) ? up : okDn ? dn : y;
      }
      ui.tagRects.push([x, y, w, h]);
      const p = this.pop;
      const drop = Math.round((1 - easeOutBack(p, 2)) * -5);
      if (this.style === 'float') drawFloat(ui, this.lines, Math.min(this.maxW, ui.w - 16), x, y + Math.round((1 - easeOutBack(p, 1.6)) * 3), Math.min(1, p * 2.5), Math.round(ax));
      else drawTag(ui, this.lines, this.style, Math.min(this.maxW + 20, ui.w - 16), x, y + drop, Math.min(1, p * 2));
    };
    const ui = PixelUI.current;
    if (ui) ui.later(draw); else PixelUI.overlay.push(draw);
  }
}

/** a painted card lying on a surface (the mastery note on the planning table): repaint with set() */
export class TableCard {
  mesh: THREE.Mesh;
  private mat: THREE.MeshStandardMaterial;
  private key = '';
  constructor(private style: TagStyle, private maxW: number, private mPerPx: number) {
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.95, transparent: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.mat);
    this.mesh.receiveShadow = true;
  }
  set(lines: TagLine[]) {
    const key = JSON.stringify(lines);
    if (key === this.key) return;
    this.key = key;
    const cv = paintTag(lines, this.style, this.maxW, 7);
    this.mat.map?.dispose();
    this.mat.map = canvasTex(cv); this.mat.needsUpdate = true;
    this.mesh.scale.set(cv.width * this.mPerPx, 1, cv.height * this.mPerPx);
  }
}
