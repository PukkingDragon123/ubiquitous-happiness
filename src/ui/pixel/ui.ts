// PixelUI: an immediate-mode pixel-art UI drawn into a low-resolution canvas and shown on a full-screen quad at
// an integer scale (1 UI pixel = exactly S device pixels, nearest filtering), so it stays pixel-perfect at any
// window size. Screens add `ui.layer` to their overlays and call begin() / widgets / end() every frame.
//
//   const ui = new PixelUI();                        // or new PixelUI({ fixed: [320, 240] }) for an off-screen
//   overlays = [ui.layer]                            //   canvas (the TV), sampled by your own material
//   ui.resize(w, h, renderer.getPixelRatio())
//   update(dt) {
//     ui.begin(game.input, dt);
//     ui.panel('wood', 10, 10, 120, 80, 'STASH');
//     if (ui.button('go', 'NEW RUN', 20, 40, 80, 18, { style: 'green', key: 'Enter' })) start();
//     ui.tooltip(['Copper Nugget', { text: 'Warm, ruddy...', color: '#ccc' }]);
//     if (!ui.overUI) handleWorldClicks();
//     ui.end();
//   }
//
// Widgets return their result directly (button -> clicked, slider -> new value, tabs -> index, list -> clicked
// row). Anything drawn with panel()/block() swallows the mouse: check `ui.overUI` before world interaction.
import * as THREE from 'three';
import type { Input } from '../../core/input';
import { audio } from '../../audio/audio';
import { itemIcon, getItem, ITEMS, RARITY_COLOR } from '../../game/items';
import { drawText, measure, wrap, lineH, capH, type FontName, type TextOpts } from './font';
import { skin, btnSkin, PAD, BTN, LIP, type SkinKind, type BtnStyle, type BtnState } from './skins';
import { icon, keycap, cursorArt, type CursorName } from './art';

export type TipLine = string | { text: string; color?: string; font?: FontName; icon?: HTMLCanvasElement; gap?: number };

export interface ButtonOpts {
  style?: BtnStyle;
  disabled?: boolean;
  /** draw as toggled on */
  on?: boolean;
  icon?: string | HTMLCanvasElement;
  /** keyboard code that also triggers it (e.g. 'KeyB', 'Enter', 'Escape') */
  key?: string;
  /** keycap label drawn on the button (defaults from key) */
  keyLabel?: string;
  font?: FontName;
  align?: 'center' | 'left';
  tip?: TipLine[];
  /** sound on click ('' for none) */
  sfx?: string;
}

const KEY_LABEL: Record<string, string> = { Enter: 'ENTER', Escape: 'ESC', Tab: 'TAB', Delete: 'DEL', Space: 'SPC', Backspace: 'BKSP' };
function labelForKey(code: string) { if (KEY_LABEL[code]) return KEY_LABEL[code]; if (code.startsWith('Key')) return code.slice(3); if (code.startsWith('Digit')) return code.slice(5); return code; }

/**
 * fit a pixel-art canvas into an exact box without inventing colours: at exactly 2:1 each 2x2 block takes its
 * most common colour (outlines win ties); other ratios sample nearest. Alpha is binary.
 */
const iconBoxCache = new Map<string, HTMLCanvasElement>();
export function fitIcon(src: HTMLCanvasElement, w: number, h: number, key?: string): HTMLCanvasElement {
  const k = key ? `${key}|${w}|${h}` : '';
  if (k) { const c = iconBoxCache.get(k); if (c) return c; }
  const sw = src.width, sh = src.height;
  // integer-friendly scale: prefer exact 1:1, 1:2, 1:4 when they fit
  let s = Math.min(w / sw, h / sh);
  for (const q of [1, 0.5, 0.25]) if (s >= q) { s = q; break; }
  const ow = Math.max(1, Math.round(sw * s)), oh = Math.max(1, Math.round(sh * s));
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, sw, sh).data;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const ox = Math.floor((w - ow) / 2), oy = Math.floor((h - oh) / 2);
  const step = 1 / s;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const x0 = Math.floor(x * step), y0 = Math.floor(y * step), n = Math.max(1, Math.round(step));
    // tally the colours in the source block
    const cnt = new Map<number, number>(); let opaque = 0, tot = 0;
    for (let yy = y0; yy < Math.min(sh, y0 + n); yy++) for (let xx = x0; xx < Math.min(sw, x0 + n); xx++) {
      const i = (yy * sw + xx) * 4; tot++;
      if (sd[i + 3] < 128) continue;
      opaque++;
      const key2 = (sd[i] << 16) | (sd[i + 1] << 8) | sd[i + 2];
      cnt.set(key2, (cnt.get(key2) ?? 0) + 1);
    }
    if (opaque * 2 < tot || !opaque) continue;
    let best = 0, bn = -1, bl = 1e9;
    for (const [c, m] of cnt) { const l = ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255); if (m > bn || (m === bn && l < bl)) { best = c; bn = m; bl = l; } }
    const j = ((y + oy) * w + x + ox) * 4;
    img.data[j] = (best >> 16) & 255; img.data[j + 1] = (best >> 8) & 255; img.data[j + 2] = best & 255; img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (k) { iconBoxCache.set(k, out); if (iconBoxCache.size > 800) iconBoxCache.clear(); }
  return out;
}

/** an item's pixel icon fitted into a w x h box (falls back to a '?' crate for unknown ids) */
export function itemIconBox(id: string, w: number, h = w, level = 1): HTMLCanvasElement {
  if (!ITEMS[id]) return fitIcon(icon('?'), w, h, 'unknown');
  const key = `item|${id}|${level}`;
  const hit = iconBoxCache.get(`${key}|${w}|${h}`);
  if (hit) return hit;
  return fitIcon(itemIcon(id, level), w, h, key);
}

interface ListState { scroll: number; target: number; drag: number }

/** the UI is laid out on a canvas about this many UI pixels tall (see PixelUI.pickScale) */
export const UI_TARGET_H = 360;
const UI_MIN_H = 264, UI_MIN_W = 440;

export class PixelUI {
  readonly cv: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  w = 320; h = 180;
  /** device pixels per UI pixel */
  scale = 1;
  fixed: boolean;
  /** add to a Screen's overlays */
  layer: { scene: THREE.Scene; camera: THREE.Camera };
  private cam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
  private tex: THREE.CanvasTexture;
  private quad: THREE.Mesh;
  private targetH: number;
  private devW = 1; private devH = 1;
  // input, in UI pixels
  mx = -999; my = -999; down = false; pressed = false; released = false; rdown = false; rpressed = false; wheel = 0; inside = false;
  input: Input | null = null;
  hot: string | null = null;
  active: string | null = null;
  private hotNext: string | null = null;
  /** the mouse is over something drawn by the UI this frame (world clicks should be ignored) */
  overUI = false;
  private overNext = false;
  /** a press that began over the UI (so a drag that leaves a panel doesn't leak into the world) */
  private pressOnUI = false;
  /** a widget already took this frame's press */
  private claimed = false;
  /** every interactive widget's rect drawn last frame, by id (for tests / tutorials) */
  rects = new Map<string, [number, number, number, number]>();
  private rectsNext = new Map<string, [number, number, number, number]>();
  cursor: CursorName = 'arrow';
  drawCursor = false;
  private lastSeenT = -9;
  private cursorVisible = true;
  private tips: (() => void)[] = [];
  private lists = new Map<string, ListState>();
  private lastHot: string | null = null;
  t = 0;
  sfx = true;
  /** tint applied to the layer quad (fade the whole UI) */
  opacity = 1;

  constructor(o: { fixed?: [number, number]; targetH?: number } = {}) {
    this.fixed = !!o.fixed;
    this.targetH = o.targetH ?? UI_TARGET_H;
    this.cv = document.createElement('canvas');
    if (o.fixed) { this.w = o.fixed[0]; this.h = o.fixed[1]; }
    this.cv.width = this.w; this.cv.height = this.h;
    this.ctx = this.cv.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.tex = this.makeTex();
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    const g = new THREE.PlaneGeometry(1, 1); g.translate(0.5, -0.5, 0);
    this.quad = new THREE.Mesh(g, mat);
    this.quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(this.quad);
    this.layer = { scene, camera: this.cam };
  }

  private makeTex() {
    const t = new THREE.CanvasTexture(this.cv);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  get texture() { return this.tex; }

  /**
   * One shared UI density for every PixelUI on screen: the integer scale that makes the canvas closest to
   * UI_TARGET_H (360) UI pixels tall, never below UI_MIN_H. 960x540 -> 2 (480x270), 1280x720 -> 2 (640x360),
   * 1920x1080 -> 3 (640x360), 2560x1440 -> 4, 4K -> 6. (`targetH` from the constructor is kept for API
   * compatibility but no longer changes the density, so a HUD, a toast and a panel always share one pixel size.)
   * ?uiscale=N forces a scale.
   */
  static pickScale(devW: number, devH: number): number {
    const forced = Number(new URLSearchParams(location.search).get('uiscale') || 0);
    if (forced > 0) return forced;
    let best = 1, err = Infinity;
    for (let s = 1; s <= 16; s++) {
      const h = devH / s, w = devW / s;
      if (s > 1 && (h < UI_MIN_H || w < UI_MIN_W)) break;
      const e = Math.abs(Math.log(h / UI_TARGET_H));
      if (e < err) { err = e; best = s; }
    }
    return best;
  }

  resize(cssW: number, cssH: number, pixelRatio = 1) {
    const devW = Math.max(1, Math.floor(cssW * pixelRatio)), devH = Math.max(1, Math.floor(cssH * pixelRatio));
    this.devW = devW; this.devH = devH; this.pr = pixelRatio;
    this.cam.left = 0; this.cam.right = devW; this.cam.top = devH; this.cam.bottom = 0; this.cam.updateProjectionMatrix();
    if (this.fixed) return;
    const s = PixelUI.pickScale(devW, devH);
    this.scale = s;
    const w = Math.ceil(devW / s), h = Math.ceil(devH / s);
    if (w !== this.w || h !== this.h) {
      this.w = w; this.h = h; this.cv.width = w; this.cv.height = h;
      this.ctx.imageSmoothingEnabled = false;
      this.tex.dispose(); this.tex = this.makeTex();
      (this.quad.material as THREE.MeshBasicMaterial).map = this.tex;
    }
    this.quad.position.set(0, devH, 0);
    this.quad.scale.set(w * s, h * s, 1);
  }
  private pr = 1;
  get deviceSize() { return [this.devW, this.devH] as const; }

  /** start a frame: clears the canvas and maps the mouse (map: css px -> ui px, for off-screen canvases) */
  begin(input: Input | null, dt = 1 / 60, map?: (cssX: number, cssY: number) => [number, number] | null) {
    this.input = input;
    this.t += dt;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.globalAlpha = 1;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.hot = this.hotNext; this.hotNext = null;
    this.overUI = this.overNext; this.overNext = false;
    this.claimed = false;
    this.rects = this.rectsNext; this.rectsNext = new Map();
    this.tips = [];
    if (input) {
      const m = input.mouse;
      let p: [number, number] | null;
      if (map) p = map(m.x, m.y);
      else { const pr = this.pr; p = [Math.floor((m.x * pr) / this.scale), Math.floor((m.y * pr) / this.scale)]; }
      // don't trust mouse.inside for hit tests: in an iframe (claude.ai artifacts) document mouseenter/leave
      // can be missed, which would make every button dead. Any move or press means the pointer is here.
      if (m.moved || input.pressed.has('Mouse0')) this.lastSeenT = this.t;
      this.inside = !!p;
      this.cursorVisible = m.inside || this.t - this.lastSeenT < 2;
      this.mx = p ? p[0] : -999; this.my = p ? p[1] : -999;
      this.down = input.down.has('Mouse0'); this.pressed = input.pressed.has('Mouse0'); this.released = input.released.has('Mouse0');
      this.rdown = input.down.has('Mouse2'); this.rpressed = input.pressed.has('Mouse2');
      this.wheel = m.wheel;
    } else { this.pressed = this.released = this.rpressed = false; this.wheel = 0; }
    if (this.pressed) this.pressOnUI = this.overUI;
    if (!this.down && !this.pressed) this.active = null;
    this.cursor = 'arrow';
  }

  /** finish a frame: tooltips, cursor, upload */
  end() {
    for (const t of this.tips) t();
    if (this.drawCursor && this.inside && this.cursorVisible) {
      const c = cursorArt(this.cursor);
      this.ctx.drawImage(c.cv, this.mx - c.hx, this.my - c.hy);
    }
    if (this.hot && this.hot !== this.lastHot && this.sfx) audio.play('k_tick1', { vol: 0.12, dry: true, rate: 1.3 });
    this.lastHot = this.hot;
    (this.quad.material as THREE.MeshBasicMaterial).opacity = this.opacity;
    this.tex.needsUpdate = true;
  }

  /** true while a world drag that started over the UI is held */
  get uiOwnsDrag() { return this.down && this.pressOnUI; }
  /** the mouse is over UI drawn last frame or so far this frame (call after drawing, before world input) */
  get mouseOnUI() { return this.overUI || this.overNext || this.claimed; }

  // ---------------------------------------------------------------- primitives
  fill(x: number, y: number, w: number, h: number, col: string, alpha = 1) {
    const c = this.ctx; c.globalAlpha = alpha; c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); c.globalAlpha = 1;
  }
  /** 1 px rectangle outline */
  rect(x: number, y: number, w: number, h: number, col: string) {
    this.fill(x, y, w, 1, col); this.fill(x, y + h - 1, w, 1, col); this.fill(x, y, 1, h, col); this.fill(x + w - 1, y, 1, h, col);
  }
  /** dotted line (marching ants when t advances) */
  dotted(x0: number, y0: number, x1: number, y1: number, col: string, phase = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    this.ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) if (((i + phase) >> 1) & 1) this.ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), 1, 1);
  }
  frame(kind: SkinKind, x: number, y: number, w: number, h: number, alpha = 1) {
    const c = this.ctx; if (alpha < 1) c.globalAlpha = alpha;
    c.drawImage(skin(kind, w, h), Math.round(x), Math.round(y));
    c.globalAlpha = 1;
  }
  text(str: string, x: number, y: number, o: TextOpts = {}) { return drawText(this.ctx, str, x, y, o); }
  /** wrapped text block; returns its height */
  textBox(str: string, x: number, y: number, w: number, o: TextOpts = {}) {
    const f = o.font ?? 'body', lh = lineH(f);
    const lines = wrap(str, f, w);
    lines.forEach((l, i) => drawText(this.ctx, l, o.align === 'center' ? x + w / 2 : o.align === 'right' ? x + w : x, y + i * lh, o));
    return lines.length * lh;
  }
  measure(str: string, font: FontName = 'body') { return measure(str, font); }
  lh(font: FontName = 'body') { return lineH(font); }
  cap(font: FontName = 'body') { return capH(font); }
  img(cv: CanvasImageSource & { width: number; height: number }, x: number, y: number, o: { w?: number; h?: number; alpha?: number; flipX?: boolean } = {}) {
    const c = this.ctx;
    if (o.alpha !== undefined) c.globalAlpha = o.alpha;
    const w = o.w ?? cv.width, h = o.h ?? cv.height;
    if (o.flipX) { c.save(); c.translate(Math.round(x) + w, Math.round(y)); c.scale(-1, 1); c.drawImage(cv, 0, 0, w, h); c.restore(); }
    else c.drawImage(cv, Math.round(x), Math.round(y), w, h);
    c.globalAlpha = 1;
  }
  icon(name: string, x: number, y: number, alpha = 1) { const i = icon(name); this.img(i, x, y, { alpha }); return i.width; }
  /** item icon fitted to a size box (nearest-safe downsample) */
  item(id: string, x: number, y: number, w: number, h = w, level = 1, alpha = 1) { this.img(itemIconBox(id, w, h, level), x, y, { alpha }); }
  keycap(label: string, x: number, y: number, dark = false) { const k = keycap(label, dark); this.img(k, x, y); return k.width; }
  clip(x: number, y: number, w: number, h: number) { const c = this.ctx; c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); }
  unclip() { this.ctx.restore(); }

  // ---------------------------------------------------------------- interaction
  hover(x: number, y: number, w: number, h: number) { return this.inside && this.mx >= x && this.my >= y && this.mx < x + w && this.my < y + h; }
  /** register a custom clickable region's rect under an id (see `rects`) */
  mark(id: string, x: number, y: number, w: number, h: number) { this.rectsNext.set(id, [x, y, w, h]); }
  /** mark a region as UI (swallows the mouse) */
  block(x: number, y: number, w: number, h: number) { if (this.hover(x, y, w, h)) this.overNext = true; }
  panel(kind: SkinKind, x: number, y: number, w: number, h: number, title?: string, o: { titleStyle?: TextOpts; alpha?: number } = {}) {
    this.block(x, y, w, h);
    this.frame(kind, x, y, w, h, o.alpha);
    if (title) {
      const isBp = kind === 'blueprint' || kind === 'card';
      const st: TextOpts = o.titleStyle ?? (kind === 'wood' ? { font: 'title', color: '#ffe7b0', color2: '#f0b860', shadow: '#1a0c04' } : isBp ? { font: 'title', color: '#ffffff', color2: '#cfe6ff', shadow: '#0a2046' } : kind === 'tv' ? { font: 'title', color: '#ffffff', color2: '#ffe060', shadow: '#000a30' } : { font: 'title', color: '#ffffff', shadow: '#000' });
      const tw = measure(title, st.font ?? 'title');
      if (kind === 'wood') {
        // a brass plaque hanging on the top frame
        const pw = tw + 16, ph = capH(st.font ?? 'title') + 10;
        this.frame('plaque', x + Math.round((w - pw) / 2), y - Math.round(ph / 2) + 2, pw, ph);
        this.text(title, x + w / 2, y - Math.round(ph / 2) + 7, { ...st, color: '#3a2408', color2: '#3a2408', shadow: '#f8e0a0', align: 'center' });
      } else this.text(title, x + PAD[kind][0] + 2, y + PAD[kind][1] + 1, st);
    }
  }
  /** content rect inside a panel skin */
  inner(kind: SkinKind, x: number, y: number, w: number, h: number) { const p = PAD[kind]; return { x: x + p[0], y: y + p[1], w: w - p[0] - p[2], h: h - p[1] - p[3] }; }

  private interact(id: string, x: number, y: number, w: number, h: number, disabled = false) {
    const over = this.hover(x, y, w, h);
    this.rectsNext.set(id, [x, y, w, h]);
    if (over) { this.overNext = true; if (!disabled && (!this.active || this.active === id)) this.hotNext = id; }
    if (disabled) return { over, held: false, clicked: false };
    // claim the press on the frame it happens (works for taps / instant clicks with no hover frame first)
    if (over && this.pressed && !this.claimed) { this.active = id; this.claimed = true; }
    const held = this.active === id && this.down;
    const clicked = this.active === id && this.released && over;
    if (over && !disabled) this.cursor = 'point';
    return { over, held, clicked };
  }

  button(id: string, label: string, x: number, y: number, w: number, h: number, o: ButtonOpts = {}): boolean {
    const st = o.style ?? 'wood';
    const { over, held, clicked: c0 } = this.interact(id, x, y, w, h, o.disabled);
    let clicked = c0;
    if (o.key && !o.disabled && this.input?.keyHit(o.key)) clicked = true;
    const state: BtnState = o.disabled ? 'disabled' : held ? 'down' : o.on ? 'on' : over ? 'hover' : 'normal';
    this.img(btnSkin(st, state, w, h), x, y);
    const P = BTN[st];
    const dy = state === 'down' || state === 'on' ? LIP : 0;
    const font = o.font ?? 'body';
    const faceH = h - LIP;
    const ty = y + dy + Math.round((faceH - capH(font)) / 2);
    let cx = x + 5;
    const ic = typeof o.icon === 'string' ? icon(o.icon) : o.icon;
    const kc = o.key && (o.keyLabel ?? labelForKey(o.key));
    const kcW = kc ? keycap(kc, st === 'gold').width : 0;
    const tw = label ? measure(label, font) : 0;
    const total = (ic ? ic.width + (label ? 3 : 0) : 0) + tw;
    if (o.align !== 'left') cx = x + Math.round((w - total - (kc ? kcW + 3 : 0)) / 2);
    if (ic) { this.img(ic, cx, y + dy + Math.round((faceH - ic.height) / 2), { alpha: o.disabled ? 0.5 : 1 }); cx += ic.width + 3; }
    if (label) this.text(label, cx, ty, { font, color: o.disabled ? '#9a96a0' : P.text, shadow: o.disabled ? null : P.textSh });
    if (kc) this.keycap(kc, x + w - kcW - 3, y + dy + Math.round((faceH - 12) / 2), st === 'gold');
    if (over && o.tip) this.tooltip(o.tip);
    if (clicked && this.sfx && o.sfx !== '') audio.play(o.sfx ?? (o.disabled ? 'k_err1' : 'k_click1'), { vol: 0.4, dry: true });
    return clicked;
  }

  /** square icon button */
  iconButton(id: string, ic: string, x: number, y: number, o: ButtonOpts & { size?: number } = {}) {
    const s = o.size ?? 16;
    return this.button(id, '', x, y, s, s + LIP, { ...o, icon: ic });
  }

  /** a row of tabs on top of a panel; returns the selected index */
  tabs(id: string, labels: string[], sel: number, x: number, y: number, o: { style?: BtnStyle; h?: number; gap?: number; font?: FontName; w?: number } = {}): number {
    let cx = x;
    const h = o.h ?? 16;
    labels.forEach((l, i) => {
      const w = o.w ?? measure(l, o.font ?? 'body') + 12;
      if (this.button(id + ':' + i, l, cx, y, w, h, { style: o.style ?? 'wood', on: i === sel, sfx: 'tab1', font: o.font })) { sel = i; }
      cx += w + (o.gap ?? 1);
    });
    return sel;
  }

  /** horizontal slider; returns the new value */
  slider(id: string, v: number, x: number, y: number, w: number, o: { min?: number; max?: number; step?: number; style?: 'wood' | 'tv' | 'blue' } = {}): number {
    const min = o.min ?? 0, max = o.max ?? 1, h = 9;
    const { over, held } = this.interact(id, x - 3, y - 3, w + 6, h + 6);
    const P = BTN[o.style ?? 'wood'];
    const k = (v - min) / (max - min || 1);
    // track
    this.fill(x, y + 3, w, 3, P.out); this.fill(x + 1, y + 4, w - 2, 1, P.lip);
    this.fill(x + 1, y + 4, Math.round((w - 2) * k), 1, P.hi);
    // ticks
    for (let i = 0; i <= 4; i++) this.fill(x + Math.round((w - 1) * i / 4), y + 7, 1, 2, P.lo);
    const kx = x + Math.round((w - 1) * k) - 3;
    this.img(btnSkin(o.style ?? 'wood', held ? 'down' : over ? 'hover' : 'normal', 7, 10), kx, y - 1);
    if (held) {
      let nv = min + ((this.mx - x) / (w - 1)) * (max - min);
      if (o.step) nv = Math.round(nv / o.step) * o.step;
      nv = Math.max(min, Math.min(max, nv));
      if (nv !== v && this.sfx) audio.play('k_tick2', { vol: 0.1, dry: true, rate: 0.8 + (nv - min) / (max - min || 1) * 0.6 });
      return nv;
    }
    if (over && this.wheel) { const st = o.step ?? (max - min) / 20; return Math.max(min, Math.min(max, v - this.wheel * st)); }
    return v;
  }

  /** a labelled checkbox; returns the new state */
  toggle(id: string, on: boolean, label: string, x: number, y: number, o: { style?: BtnStyle; font?: FontName } = {}): boolean {
    const w = 10 + 4 + measure(label, o.font ?? 'body');
    const { over, clicked } = this.interact(id, x, y, w, 12);
    this.img(btnSkin(o.style ?? 'wood', on ? 'on' : over ? 'hover' : 'normal', 10, 12), x, y);
    if (on) this.icon('check', x + 1, y + 2 + LIP);
    this.text(label, x + 14, y + 2, { font: o.font ?? 'body', color: over ? '#ffffff' : '#e8e0d0', shadow: '#000' });
    if (clicked) { if (this.sfx) audio.play('k_toggle2', { vol: 0.35, dry: true }); return !on; }
    return on;
  }

  /** ◄ value ► stepper; returns -1, 0 or +1 */
  stepper(id: string, value: string, x: number, y: number, w: number, o: { style?: BtnStyle; font?: FontName; color?: string; canL?: boolean; canR?: boolean } = {}): number {
    let r = 0;
    const st = o.style ?? 'wood';
    if (this.button(id + ':l', '', x, y, 14, 16, { style: st, icon: 'left', disabled: o.canL === false, sfx: 'k_tick4' })) r = -1;
    if (this.button(id + ':r', '', x + w - 14, y, 14, 16, { style: st, icon: 'right', disabled: o.canR === false, sfx: 'k_tick4' })) r = 1;
    const font = o.font ?? 'title';
    this.text(value, x + w / 2, y + Math.round((14 - capH(font)) / 2), { font, color: o.color ?? '#ffffff', shadow: '#000', align: 'center' });
    if (this.hover(x, y, w, 16) && this.wheel) r = this.wheel > 0 ? 1 : -1;
    return r;
  }

  /** a tooltip near the mouse, drawn on top at end() */
  tooltip(lines: TipLine[] | string, o: { kind?: SkinKind; maxW?: number; at?: [number, number] } = {}) {
    const L = (typeof lines === 'string' ? [lines] : lines).map((l) => (typeof l === 'string' ? { text: l } : l));
    const kind = o.kind ?? 'paper';
    const maxW = o.maxW ?? 150;
    this.tips.push(() => {
      const rows: { text: string; color?: string; font: FontName; icon?: HTMLCanvasElement; gap: number }[] = [];
      for (const l of L) {
        const f = l.font ?? 'body';
        const ws = wrap(l.text, f, maxW - (l.icon ? l.icon.width + 3 : 0));
        ws.forEach((t, i) => rows.push({ text: t, color: l.color, font: f, icon: i === 0 ? l.icon : undefined, gap: i === 0 ? l.gap ?? 0 : 0 }));
      }
      const pad = PAD[kind];
      const w = Math.min(maxW, Math.max(...rows.map((r) => measure(r.text, r.font) + (r.icon ? r.icon.width + 3 : 0)))) + pad[0] + pad[2] + 2;
      const h = rows.reduce((a, r) => a + Math.max(lineH(r.font), r.icon ? r.icon.height + 1 : 0) + r.gap, 0) + pad[1] + pad[3];
      let x = o.at ? o.at[0] : this.mx + 12, y = o.at ? o.at[1] : this.my + 10;
      if (x + w > this.w - 2) x = (o.at ? x : this.mx - 6) - w;
      if (y + h > this.h - 2) y = this.h - 2 - h;
      x = Math.max(2, x); y = Math.max(2, y);
      this.frame(kind, x, y, w, h);
      let cy = y + pad[1];
      const dark = kind === 'paper';
      for (const r of rows) {
        cy += r.gap;
        let cx = x + pad[0] + 1;
        if (r.icon) { this.img(r.icon, cx, cy); cx += r.icon.width + 3; }
        const ih = r.icon ? r.icon.height : 0;
        this.text(r.text, cx, cy + Math.max(0, Math.round((ih - capH(r.font)) / 2)), { font: r.font, color: r.color ?? (dark ? '#2a1808' : '#f0f4ff'), shadow: dark ? null : '#000' });
        cy += Math.max(lineH(r.font), ih + 1);
      }
    });
  }

  /** standard tooltip lines for an item id */
  itemTip(id: string, level = 1, extra: TipLine[] = []): TipLine[] {
    const d = ITEMS[id];
    if (!d) return [{ text: id, font: 'title' }];
    const out: TipLine[] = [
      { text: d.name + (level > 1 ? ` +${level - 1}` : ''), font: 'title', color: shadeFor(RARITY_COLOR[d.rarity]) },
      { text: `${d.rarity} ${d.kind}`.toUpperCase(), font: 'tiny', color: '#7a5a3a', gap: 1 },
      { text: d.desc, color: '#3a2810', gap: 2 },
    ];
    if (d.note) out.push({ text: d.note(level), color: '#1a4a7a' });
    return out.concat(extra);
  }

  /** item icon + count pairs; red count when you have less than needed. Returns the width drawn */
  costRow(cost: Record<string, number>, x: number, y: number, o: { have?: Record<string, number>; size?: number; font?: FontName; dark?: boolean; gap?: number; showHave?: boolean } = {}): number {
    const size = o.size ?? 16;
    const font = o.font ?? 'small';
    let cx = x;
    for (const [id, n] of Object.entries(cost)) {
      const have = o.have?.[id] ?? Infinity;
      const ok = have >= n;
      const hov = this.hover(cx, y, size + 14, size);
      this.item(id, cx, y, size, size);
      const label = o.showHave && o.have ? `${Math.min(have, 999)}/${n}` : `${n}`;
      const col = ok ? (o.dark ? '#ffffff' : '#ffffff') : '#ff5a4a';
      const tw = this.text(label, cx + size + 1, y + Math.round((size - capH(font)) / 2), { font, color: col, outline: ok ? '#0a1a34' : '#3a0404' });
      if (hov && ITEMS[id]) this.tooltip([{ text: getItem(id).name, font: 'body', color: '#2a1808' }, { text: o.have ? `have ${o.have[id] ?? 0} · need ${n}` : `need ${n}`, font: 'small', color: ok ? '#2a5a2a' : '#a01010' }]);
      cx += size + tw + (o.gap ?? 5);
    }
    return cx - x;
  }

  /** width costRow() would take */
  costWidth(cost: Record<string, number>, o: { have?: Record<string, number>; size?: number; font?: FontName; gap?: number; showHave?: boolean } = {}) {
    const size = o.size ?? 16; let w = 0;
    for (const [id, n] of Object.entries(cost)) { const have = o.have?.[id] ?? 0; w += size + 1 + measure(o.showHave && o.have ? `${Math.min(have, 999)}/${n}` : `${n}`, o.font ?? 'small') + (o.gap ?? 5); }
    return w;
  }

  /** a keycap + label hint ('R rotate'); returns width */
  hint(key: string, label: string, x: number, y: number, o: { color?: string; dark?: boolean } = {}) {
    let w = 0;
    if (key === 'LMB' || key === 'RMB' || key === 'MMB') {
      // mouse glyph drawn inline
      const g = this.mouseGlyph(key);
      this.img(g, x, y + 1); w = g.width + 3;
    } else w = this.keycap(key, x, y, o.dark) + 3;
    w += this.text(label, x + w, y + 3, { font: 'small', color: o.color ?? '#f4ecd8', shadow: '#000' });
    return w + 8;
  }
  private glyphCache = new Map<string, HTMLCanvasElement>();
  private mouseGlyph(k: string) {
    let g = this.glyphCache.get(k);
    if (!g) {
      const rows = ['.kkkkk.', 'kAAkBBk', 'kAAkBBk', 'kAAkBBk', 'kkkkkkk', 'kllllgk', 'kllllgk', 'kllllgk', '.kgggk.', '..kkk..'];
      const A = k === 'LMB' ? '#ffd860' : '#d9d4cc', B = k === 'RMB' ? '#ffd860' : '#d9d4cc';
      const cv = document.createElement('canvas'); cv.width = 7; cv.height = 10;
      const x = cv.getContext('2d')!;
      const pal: Record<string, string> = { k: '#0e0a14', l: '#d9d4cc', g: '#9a948c', A, B };
      rows.forEach((r, yy) => { for (let i = 0; i < r.length; i++) { const c = pal[r[i]]; if (c) { x.fillStyle = c; x.fillRect(i, yy, 1, 1); } } });
      if (k === 'MMB') { x.fillStyle = '#ffd860'; x.fillRect(3, 1, 1, 3); }
      g = cv; this.glyphCache.set(k, g);
    }
    return g;
  }

  /**
   * a scrollable list of n rows; row(i, x, y, w, hovered) draws one. Returns the clicked row or -1.
   * Wheel scrolls; a pixel scrollbar appears when the content overflows.
   */
  list(id: string, x: number, y: number, w: number, h: number, n: number, rowH: number, row: (i: number, x: number, y: number, w: number, hov: boolean) => void, o: { style?: 'wood' | 'tv' | 'blue' | 'dark'; cols?: number } = {}): number {
    const cols = o.cols ?? 1;
    const rows = Math.ceil(n / cols);
    let s = this.lists.get(id);
    if (!s) { s = { scroll: 0, target: 0, drag: -1 }; this.lists.set(id, s); }
    const contentH = rows * rowH;
    const maxScroll = Math.max(0, contentH - h);
    const sbW = maxScroll > 0 ? 6 : 0;
    const over = this.hover(x, y, w, h);
    if (over) { this.overNext = true; if (this.wheel) { s.target += this.wheel * rowH; } }
    s.target = Math.max(0, Math.min(maxScroll, s.target));
    s.scroll += (s.target - s.scroll) * 0.35;
    if (Math.abs(s.target - s.scroll) < 0.5) s.scroll = s.target;
    const sc = Math.round(s.scroll);
    let clicked = -1;
    const cw = Math.floor((w - sbW) / cols);
    this.clip(x, y, w - sbW, h);
    const r0 = Math.floor(sc / rowH), r1 = Math.min(rows - 1, Math.ceil((sc + h) / rowH));
    for (let r = r0; r <= r1; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c; if (i >= n) break;
      const rx = x + c * cw, ry = y + r * rowH - sc;
      const hov = over && this.hover(rx, Math.max(y, ry), cw, Math.min(rowH, y + h - ry)) && s.drag < 0;
      if (ry >= y && ry + rowH <= y + h) this.rectsNext.set(id + ':' + i, [rx, ry, cw, rowH]);
      row(i, rx, ry, cw, hov);
      if (hov) { this.cursor = 'point'; this.hotNext = id + ':' + i; if (this.pressed && !this.claimed) { this.active = id + ':' + i; this.claimed = true; } if (this.released && this.active === id + ':' + i) clicked = i; }
    }
    this.unclip();
    if (maxScroll > 0) {
      const P = BTN[o.style === 'blue' ? 'blue' : o.style === 'tv' ? 'tv' : o.style === 'dark' ? 'dark' : 'wood'];
      const tx = x + w - sbW + 1;
      this.fill(tx, y, sbW - 1, h, P.out); this.fill(tx + 1, y + 1, sbW - 3, h - 2, P.lip);
      const th = Math.max(10, Math.round((h * h) / contentH));
      const ty = y + Math.round(((h - th) * sc) / maxScroll);
      const sbHover = this.hover(tx, y, sbW, h);
      if (sbHover && this.pressed) { s.drag = this.my - ty; if (s.drag < 0 || s.drag > th) s.drag = th / 2; }
      if (s.drag >= 0) { if (!this.down) s.drag = -1; else { s.target = s.scroll = Math.max(0, Math.min(maxScroll, ((this.my - s.drag - y) / (h - th)) * maxScroll)); } }
      this.img(btnSkin(o.style === 'blue' ? 'blue' : o.style === 'tv' ? 'tv' : o.style === 'dark' ? 'dark' : 'wood', s.drag >= 0 ? 'down' : sbHover ? 'hover' : 'normal', sbW - 1, th), tx, ty);
    }
    return clicked;
  }
  resetList(id: string) { this.lists.delete(id); }

  /** a bar (hp, progress) */
  bar(x: number, y: number, w: number, h: number, v: number, col: string, back = '#1a1018') {
    this.fill(x, y, w, h, '#0e0a14');
    this.fill(x + 1, y + 1, w - 2, h - 2, back);
    const fw = Math.round((w - 2) * Math.max(0, Math.min(1, v)));
    this.fill(x + 1, y + 1, fw, h - 2, col);
    if (h > 3) this.fill(x + 1, y + 1, fw, 1, '#ffffff', 0.35);
  }

  /** pixel corner brackets around a screen-space box (selection reticle) */
  brackets(x: number, y: number, w: number, h: number, col: string, len = 5, shadow = '#000') {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    const seg = (sx: number, sy: number, dx: number, dy: number) => {
      for (let i = 0; i < len; i++) { this.fill(sx + dx * i + 1, sy + dy * i + 1, 1, 1, shadow); }
      for (let i = 0; i < len; i++) this.fill(sx + dx * i, sy + dy * i, 1, 1, col);
    };
    seg(x, y, 1, 0); seg(x, y, 0, 1); seg(x + w, y, -1, 0); seg(x + w, y, 0, 1);
    seg(x, y + h, 1, 0); seg(x, y + h, 0, -1); seg(x + w, y + h, -1, 0); seg(x + w, y + h, 0, -1);
  }
}

function shadeFor(c: string) {
  // rarity colours are tuned for dark backgrounds; darken them for the paper tooltip
  const v = parseInt(c.slice(1), 16);
  const r = ((v >> 16) & 255) * 0.55, g = ((v >> 8) & 255) * 0.55, b = (v & 255) * 0.55;
  return '#' + [r, g, b].map((k) => Math.round(k).toString(16).padStart(2, '0')).join('');
}
