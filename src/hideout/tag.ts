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
import { PixelUI, drawCard, cardLayout } from '../ui/pixel/ui';
import { KIT, skin, type SkinKind } from '../ui/pixel/skins';
import { easeOutBack } from '../core/math';

export interface TagLine { text: string; font?: FontName; color?: string; gap?: number; key?: string }
export type TagStyle = 'paper' | 'wood' | 'brass' | 'slate';

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
  return drawCard(ui, cardLines(lines, style), kindOf(style), maxW, [x, y], { alpha, pin: style === 'paper' });
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
    const L = cardLayout(ui, cardLines(this.lines, this.style), kindOf(this.style), Math.min(this.maxW + 20, ui.w - 16));
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
      drawTag(ui, this.lines, this.style, Math.min(this.maxW + 20, ui.w - 16), x, y + drop, Math.min(1, p * 2));
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
